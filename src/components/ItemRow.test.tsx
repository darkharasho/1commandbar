import { render, screen } from "@testing-library/react";
import ItemRow from "./ItemRow";
import type { SearchResult } from "../types";

const item: SearchResult = {
  id: "1", title: "GitHub", username: "octocat", vault: "Personal",
  url: "https://github.com", category: "LOGIN", score: 0,
};

describe("ItemRow", () => {
  it("renders title, username, vault", () => {
    render(<ItemRow item={item} selected={false} />);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.getByText(/octocat/)).toBeInTheDocument();
    expect(screen.getByText(/Personal/)).toBeInTheDocument();
  });

  it("applies selected styles when selected", () => {
    const { container } = render(<ItemRow item={item} selected={true} />);
    expect(container.firstChild).toHaveClass("bg-bar-elevated");
  });
});
