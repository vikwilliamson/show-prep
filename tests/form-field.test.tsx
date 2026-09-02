// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormField } from "@/components/FormField";

describe("FormField", () => {
  it("renders a text input with the label and value", () => {
    render(<FormField label="Target name" value="Summer cut" onChange={() => {}} />);
    const input = screen.getByLabelText("Target name");
    expect(input).toHaveValue("Summer cut");
    expect(input).toHaveAttribute("type", "text");
  });

  it("calls onChange with the new value when the user types", async () => {
    const onChange = vi.fn();
    render(<FormField label="Target name" value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Target name"), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders a number input with the given step", () => {
    render(<FormField label="Weight" type="number" step={0.5} value="180" onChange={() => {}} />);
    const input = screen.getByLabelText("Weight");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("step", "0.5");
    expect(input).toHaveValue(180);
  });

  it("renders a date input", () => {
    render(<FormField label="Target date" type="date" value="2026-12-01" onChange={() => {}} />);
    expect(screen.getByLabelText("Target date")).toHaveAttribute("type", "date");
  });

  it("renders a textarea with the given rows and placeholder, and reports typed text", async () => {
    const onChange = vi.fn();
    render(
      <FormField
        label="Notes"
        type="textarea"
        rows={4}
        placeholder="e.g. felt great"
        value=""
        onChange={onChange}
      />,
    );
    const textarea = screen.getByLabelText("Notes");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("rows", "4");
    expect(textarea).toHaveAttribute("placeholder", "e.g. felt great");
    await userEvent.type(textarea, "x");
    expect(onChange).toHaveBeenCalledWith("x");
  });
});
