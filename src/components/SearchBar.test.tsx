import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchBar from "./SearchBar";

describe("SearchBar", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("debounces onQueryChange", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onChange = vi.fn();
    render(<SearchBar onQueryChange={onChange} onOpenSettings={() => {}} />);
    const input = screen.getByPlaceholderText("Search 1Password…");
    await user.type(input, "git");
    expect(onChange).not.toHaveBeenCalledWith("git");
    act(() => { vi.advanceTimersByTime(35); });
    expect(onChange).toHaveBeenLastCalledWith("git");
  });
});
