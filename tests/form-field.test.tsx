import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormField } from "@/components/FormField";

describe("FormField", () => {
  it("renders a text input with the label and value", () => {
    const html = renderToStaticMarkup(
      <FormField label="Target name" value="Summer cut" onChange={() => {}} />,
    );
    expect(html).toContain("Target name");
    expect(html).toContain('value="Summer cut"');
    expect(html).toMatch(/<input[^>]*type="text"/);
  });

  it("renders a number input with the given step", () => {
    const html = renderToStaticMarkup(
      <FormField label="Weight" type="number" step={0.5} value="180" onChange={() => {}} />,
    );
    expect(html).toMatch(/<input[^>]*type="number"/);
    expect(html).toContain('step="0.5"');
  });

  it("renders a date input", () => {
    const html = renderToStaticMarkup(
      <FormField label="Target date" type="date" value="2026-12-01" onChange={() => {}} />,
    );
    expect(html).toMatch(/<input[^>]*type="date"/);
  });

  it("renders a textarea with the given rows and placeholder", () => {
    const html = renderToStaticMarkup(
      <FormField
        label="Notes"
        type="textarea"
        rows={4}
        placeholder="e.g. felt great"
        value=""
        onChange={() => {}}
      />,
    );
    expect(html).toMatch(/<textarea[^>]*rows="4"/);
    expect(html).toContain('placeholder="e.g. felt great"');
  });
});
