import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResultsList from "./ResultsList";
import type { SearchResult } from "../types";
import { useState } from "react";

const items: SearchResult[] = [
  { id: "1", title: "GitHub", username: "oct", vault: "P", url: null, category: "LOGIN", score: 0 },
  { id: "2", title: "Gmail", username: "me", vault: "P", url: null, category: "LOGIN", score: 0 },
  { id: "3", title: "GitLab", username: "w", vault: "W", url: null, category: "LOGIN", score: 0 },
];

function Harness() {
  const [idx, setIdx] = useState(0);
  return <ResultsList items={items} selectedIndex={idx} onSelectedChange={setIdx} />;
}

describe("ResultsList", () => {
  it("renders all items", () => {
    render(<Harness />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText("Gmail")).toBeInTheDocument();
    expect(screen.getByText("GitLab")).toBeInTheDocument();
  });

  it("wraps arrow-key selection", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const list = screen.getByRole("listbox");
    list.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}"); // wraps back to 0
    const rows = screen.getAllByRole("option");
    expect(rows[0]).toHaveAttribute("aria-selected", "true");
  });

  it("arrow up from 0 wraps to last", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("listbox").focus();
    await user.keyboard("{ArrowUp}");
    const rows = screen.getAllByRole("option");
    expect(rows[2]).toHaveAttribute("aria-selected", "true");
  });
});
