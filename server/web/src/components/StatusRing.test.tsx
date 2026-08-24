import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusRing } from "./StatusRing";

describe("StatusRing", () => {
  it("titles green as Active", () => {
    render(<StatusRing status="green" />);
    expect(screen.getByTitle("Active")).toBeInTheDocument();
  });

  it("titles red as Branch off", () => {
    render(<StatusRing status="red" />);
    expect(screen.getByTitle("Branch off")).toBeInTheDocument();
  });

  it("titles amber as Blocked by a parent", () => {
    render(<StatusRing status="amber" />);
    expect(screen.getByTitle("Blocked by a parent")).toBeInTheDocument();
  });

  it("defaults to 18px and honors an explicit size", () => {
    const { container, rerender } = render(<StatusRing status="green" />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "18");

    rerender(<StatusRing status="green" size={20} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "20");
  });
});
