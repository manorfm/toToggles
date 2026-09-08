import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DottedPath } from "./DottedPath";

describe("DottedPath", () => {
  it("renders one span per segment, with the raw text as segment content", () => {
    const { container } = render(<DottedPath segments={["payments", "card", "apple-pay"]} />);

    expect(container.textContent).toBe("payments.card.apple-pay");
  });

  it("puts a separate '.dot' span BETWEEN segments — none before the first, none after the last", () => {
    const { container } = render(<DottedPath segments={["a", "b", "c"]} />);

    const dots = container.querySelectorAll(".dot");
    expect(dots).toHaveLength(2);
    dots.forEach((dot) => expect(dot.textContent).toBe("."));
  });

  it("renders no dot at all for a single segment", () => {
    const { container } = render(<DottedPath segments={["solo"]} />);

    expect(container.querySelectorAll(".dot")).toHaveLength(0);
    expect(container.textContent).toBe("solo");
  });

  it("renders nothing for an empty segment list", () => {
    const { container } = render(<DottedPath segments={[]} />);

    expect(container.textContent).toBe("");
  });
});
