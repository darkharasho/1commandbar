use crate::op_cli::{ItemSummary, OpRunner, list_items};
use crate::error::AppResult;
use nucleo::{Matcher, Utf32Str};
use nucleo::pattern::{CaseMatching, Normalization, Pattern};
use serde::Serialize;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub username: String,
    pub vault: String,
    pub url: Option<String>,
    pub category: String,
    pub score: u32,
}

#[derive(Default)]
pub struct Vault {
    inner: RwLock<Option<VaultState>>,
}

struct VaultState {
    items: Vec<ItemSummary>,
    loaded_at: Instant,
}

impl Vault {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub async fn refresh(&self, runner: &dyn OpRunner) -> AppResult<()> {
        let items = list_items(runner).await?;
        *self.inner.write().unwrap() = Some(VaultState { items, loaded_at: Instant::now() });
        Ok(())
    }

    pub fn is_stale(&self, ttl: Duration) -> bool {
        match &*self.inner.read().unwrap() {
            Some(s) => s.loaded_at.elapsed() > ttl,
            None => true,
        }
    }

    pub fn len(&self) -> usize {
        self.inner.read().unwrap().as_ref().map(|s| s.items.len()).unwrap_or(0)
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchResult> {
        let guard = self.inner.read().unwrap();
        let Some(state) = guard.as_ref() else { return Vec::new() };

        if query.trim().is_empty() {
            return state.items.iter().take(limit).map(|i| to_result(i, 0)).collect();
        }

        let mut matcher = Matcher::new(nucleo::Config::DEFAULT);
        let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);

        let mut scored: Vec<(u32, &ItemSummary)> = state.items.iter().filter_map(|item| {
            let haystack = format!(
                "{} {} {}",
                item.title,
                item.additional_information.as_deref().unwrap_or(""),
                item.urls.iter().map(|u| u.href.as_str()).collect::<Vec<_>>().join(" ")
            );
            let mut buf = Vec::new();
            let score = pattern.score(Utf32Str::new(&haystack, &mut buf), &mut matcher)?;
            Some((score, item))
        }).collect();

        scored.sort_by(|a, b| b.0.cmp(&a.0));
        scored.truncate(limit);
        scored.into_iter().map(|(score, i)| to_result(i, score)).collect()
    }
}

fn to_result(item: &ItemSummary, score: u32) -> SearchResult {
    let url = item.urls.iter().find(|u| u.primary).or_else(|| item.urls.first()).map(|u| u.href.clone());
    SearchResult {
        id: item.id.clone(),
        title: item.title.clone(),
        username: item.additional_information.clone().unwrap_or_default(),
        vault: item.vault.name.clone(),
        url,
        category: item.category.clone(),
        score,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::op_cli::FakeRunner;

    const FIXTURE: &str = r#"[
      {"id":"1","title":"GitHub","category":"LOGIN","vault":{"id":"v","name":"Personal"},"urls":[{"href":"https://github.com","primary":true}],"additional_information":"octocat"},
      {"id":"2","title":"Gmail","category":"LOGIN","vault":{"id":"v","name":"Personal"},"urls":[{"href":"https://mail.google.com","primary":true}],"additional_information":"me@gmail.com"},
      {"id":"3","title":"GitLab","category":"LOGIN","vault":{"id":"v","name":"Work"},"urls":[{"href":"https://gitlab.com","primary":true}],"additional_information":"worker"}
    ]"#;

    async fn make_vault() -> Arc<Vault> {
        let v = Vault::new();
        let runner = FakeRunner::new(vec![Ok(FIXTURE.to_string())]);
        v.refresh(&runner).await.unwrap();
        v
    }

    #[tokio::test]
    async fn empty_query_returns_all_up_to_limit() {
        let v = make_vault().await;
        let r = v.search("", 10);
        assert_eq!(r.len(), 3);
    }

    #[tokio::test]
    async fn fuzzy_ranks_github_above_gmail_for_gh() {
        let v = make_vault().await;
        let r = v.search("gh", 10);
        assert!(!r.is_empty());
        assert_eq!(r[0].title, "GitHub");
    }

    #[tokio::test]
    async fn matches_by_username() {
        let v = make_vault().await;
        let r = v.search("octocat", 10);
        assert_eq!(r[0].title, "GitHub");
    }

    #[tokio::test]
    async fn matches_by_url() {
        let v = make_vault().await;
        let r = v.search("gitlab.com", 10);
        assert_eq!(r[0].title, "GitLab");
    }

    #[tokio::test]
    async fn is_stale_when_empty() {
        let v = Vault::new();
        assert!(v.is_stale(Duration::from_secs(300)));
    }

    #[tokio::test]
    async fn is_fresh_after_refresh() {
        let v = make_vault().await;
        assert!(!v.is_stale(Duration::from_secs(300)));
    }
}
