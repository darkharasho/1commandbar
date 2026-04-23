import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionMenu from "./ActionMenu";

describe("ActionMenu", () => {
  it("calls onAction with the right key", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(<ActionMenu onAction={onAction} onClose={onClose} />);
    await user.click(screen.getByText(/Copy Password/));
    expect(onAction).toHaveBeenCalledWith("copy-password");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(<ActionMenu onAction={onAction} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
