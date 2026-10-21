import { describe, expect, test } from "bun:test";
import widget from "../api/widget.js";

type FakeElement = {
  dataset: Record<string, string>;
  className: string;
  innerHTML: string;
  onclick: (() => void) | null;
  textContent?: string;
  remove?: () => void;
  closest?: () => FakeElement;
};

function makeRes() {
  return {
    statusCode: 200,
    body: "",
    headers: {} as Record<string, string>,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: string) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function runWidget(script: string, button: FakeElement) {
  let modal: FakeElement | null = null;
  const document = {
    head: { appendChild() {} },
    body: {
      appendChild(element: FakeElement) {
        modal = element;
      },
    },
    querySelectorAll() {
      return [button];
    },
    createElement(tag: string): FakeElement {
      if (tag === "style") return { dataset: {}, className: "", innerHTML: "", onclick: null, textContent: "" };
      return {
        dataset: {},
        className: "",
        innerHTML: "",
        onclick: null,
        remove() {},
        closest() {
          return this;
        },
      };
    },
  };
  const window = {};
  new Function("window", "document", script)(window, document);
  return {
    get modal() {
      return modal;
    },
  };
}

describe("widget output escaping", () => {
  test("a label from the query string cannot inject HTML into the host page", () => {
    const payload = "<img src=x onerror=alert(1)>";
    const res = makeRes();
    const button: FakeElement = { dataset: {}, className: "", innerHTML: "", onclick: null };

    widget({ method: "GET", query: { label: payload }, headers: {} }, res);
    runWidget(res.body, button);

    expect(button.innerHTML).not.toContain("<img");
    expect(button.innerHTML).toContain("&lt;img");
  });

  test("provider and amount query values cannot inject HTML into the modal", () => {
    const res = makeRes();
    const button: FakeElement = { dataset: {}, className: "", innerHTML: "", onclick: null };

    widget(
      {
        method: "GET",
        query: {
          provider: "\"><img src=x onerror=alert(2)>",
          amount: "<svg onload=alert(3)>",
          label: "Pay",
        },
        headers: {},
      },
      res,
    );
    const runtime = runWidget(res.body, button);
    button.onclick?.();

    expect(runtime.modal?.innerHTML).not.toContain("<img");
    expect(runtime.modal?.innerHTML).not.toContain("<svg");
    expect(runtime.modal?.innerHTML).toContain("&lt;img");
    expect(runtime.modal?.innerHTML).toContain("&lt;svg");
  });
});
