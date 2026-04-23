use crate::error::AppResult;
use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

pub fn socket_path() -> PathBuf {
    std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir())
        .join("1commandbar.sock")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Toggle,
    Show,
    Hide,
    Quit,
    Unknown(String),
}

impl Command {
    pub fn parse(s: &str) -> Self {
        match s.trim() {
            "toggle" => Self::Toggle,
            "show" => Self::Show,
            "hide" => Self::Hide,
            "quit" => Self::Quit,
            other => Self::Unknown(other.to_string()),
        }
    }
    pub fn as_str(&self) -> &str {
        match self {
            Self::Toggle => "toggle",
            Self::Show => "show",
            Self::Hide => "hide",
            Self::Quit => "quit",
            Self::Unknown(s) => s,
        }
    }
}

pub async fn send(path: &std::path::Path, cmd: Command) -> AppResult<()> {
    let mut stream = UnixStream::connect(path).await?;
    stream.write_all(cmd.as_str().as_bytes()).await?;
    stream.write_all(b"\n").await?;
    stream.shutdown().await?;
    Ok(())
}

pub async fn try_send(path: &std::path::Path, cmd: Command) -> bool {
    send(path, cmd).await.is_ok()
}

pub struct Listener {
    listener: UnixListener,
    path: PathBuf,
}

impl Listener {
    pub fn bind(path: PathBuf) -> AppResult<Self> {
        let _ = std::fs::remove_file(&path);
        let listener = UnixListener::bind(&path)?;
        Ok(Self { listener, path })
    }

    pub async fn accept_command(&self) -> AppResult<Command> {
        let (stream, _) = self.listener.accept().await?;
        let mut reader = BufReader::new(stream);
        let mut line = String::new();
        reader.read_line(&mut line).await?;
        Ok(Command::parse(&line))
    }
}

impl Drop for Listener {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn parse_commands() {
        assert_eq!(Command::parse("toggle"), Command::Toggle);
        assert_eq!(Command::parse(" show\n"), Command::Show);
        assert_eq!(Command::parse("hide"), Command::Hide);
        assert_eq!(Command::parse("quit"), Command::Quit);
        assert!(matches!(Command::parse("bogus"), Command::Unknown(_)));
    }

    #[tokio::test]
    async fn round_trip_via_socket() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("t.sock");
        let listener = Listener::bind(path.clone()).unwrap();

        let send_task = tokio::spawn({
            let p = path.clone();
            async move { send(&p, Command::Toggle).await.unwrap() }
        });

        let received = listener.accept_command().await.unwrap();
        send_task.await.unwrap();
        assert_eq!(received, Command::Toggle);
    }

    #[tokio::test]
    async fn try_send_returns_false_with_no_listener() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("none.sock");
        assert!(!try_send(&path, Command::Toggle).await);
    }
}
