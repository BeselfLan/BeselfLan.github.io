import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import hello, { type TemplateArgs } from "@/apps/_template";
import TemplateApp from "@/apps/_template/TemplateApp";
import type { AppApi } from "@/os/apps/types";
import { os, useOS } from "@/os/store";
import { WindowIdContext } from "@/os/window/useWindowVisible";

// The component is rendered directly, with an api made of vi.fn()s, so each
// control is checked against the one method it must call. The hook reads the
// real store, so a few tests open a real window for it.

function makeApi() {
  let onVisible: (visible: boolean) => void = () => {};
  const unsubscribe = vi.fn();
  const unregister = vi.fn();
  const mocks = {
    close: vi.fn(),
    minimize: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    openApp: vi.fn(),
    notify: vi.fn(),
    isVisible: vi.fn(() => true),
    subscribeVisible: vi.fn((cb: (visible: boolean) => void) => {
      onVisible = cb;
      return unsubscribe;
    }),
    bounds: vi.fn(() => ({ width: 480, height: 320 })),
    registerShortcut: vi.fn<AppApi["registerShortcut"]>(() => unregister),
  };
  const api = {
    ...mocks,
    content: { profile: () => ({ name: "Ann Lee" }) },
    media: { status: () => "unknown" },
  } as unknown as AppApi;
  return {
    api,
    mocks,
    unsubscribe,
    unregister,
    setVisible: (visible: boolean) => onVisible(visible),
  };
}

// The frame provides the window id; outside the layer a test does.
const ui = (api: AppApi, args: TemplateArgs = {}) => (
  <WindowIdContext value="hello">
    <TemplateApp windowId="hello" args={args} api={api} />
  </WindowIdContext>
);

const readout = (key: string) =>
  document.querySelector(`[data-readout="${key}"]`)?.textContent;
const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  useOS.setState(useOS.getInitialState(), true);
  os.windows.setAppLookup((id) => (id === hello.id ? hello : undefined));
});

describe("Hello", () => {
  it("shows its args", () => {
    const { api } = makeApi();
    const { rerender } = render(ui(api, { name: "Ann" }));
    expect(screen.getByRole("heading", { name: "Hello, Ann" })).toBeTruthy();
    expect(screen.getByText('{"name":"Ann"}')).toBeTruthy();

    rerender(ui(api, {}));
    expect(screen.getByRole("heading", { name: "Hello, world" })).toBeTruthy();
    expect(screen.getByText("{}")).toBeTruthy();
  });

  it("every AppApi call has a control", () => {
    type Calls = ReturnType<typeof makeApi>["mocks"];
    const rows: {
      label: string;
      method:
        "close" | "minimize" | "focus" | "setTitle" | "openApp" | "notify";
      with: unknown[];
      before?(): void;
    }[] = [
      { label: "api.close()", method: "close", with: [] },
      { label: "api.minimize()", method: "minimize", with: [] },
      { label: "api.focus()", method: "focus", with: [] },
      {
        label: "api.setTitle()",
        method: "setTitle",
        with: ["A new title"],
        before: () =>
          fireEvent.change(screen.getByLabelText("Title"), {
            target: { value: "A new title" },
          }),
      },
      { label: 'api.openApp("about")', method: "openApp", with: ["about"] },
      {
        label: "api.notify()",
        method: "notify",
        with: [{ title: "Hello from Hello" }],
      },
    ];
    const methods = rows.map((r) => r.method);

    for (const row of rows) {
      const { api, mocks } = makeApi();
      const view = render(ui(api));
      row.before?.();
      fireEvent.click(button(row.label));

      for (const method of methods) {
        const mock = (mocks as Calls)[method];
        if (method === row.method) {
          expect(mock, row.label).toHaveBeenCalledTimes(1);
          expect(mock, row.label).toHaveBeenCalledWith(...row.with);
        } else {
          expect(
            mock,
            `${row.label} must not call ${method}`,
          ).not.toHaveBeenCalled();
        }
      }
      view.unmount();
    }
  });

  it("shows what the api reports", () => {
    render(ui(makeApi().api));
    expect(readout("bounds")).toBe("480 x 320");
    expect(readout("visible")).toBe("visible");
    expect(readout("profile")).toBe("Ann Lee");
    expect(readout("media")).toBe("unknown");
    expect(readout("shortcut")).toBe("0");
  });

  it("the shortcut is registered while mounted", () => {
    const { api, mocks, unregister } = makeApi();
    const view = render(ui(api));
    expect(mocks.registerShortcut).toHaveBeenCalledTimes(1);
    const shortcut = mocks.registerShortcut.mock.calls[0][0];
    expect(shortcut.combo).toBe("Alt+Shift+H");
    expect(unregister).not.toHaveBeenCalled();

    act(() => shortcut.handler(new KeyboardEvent("keydown")));
    expect(readout("shortcut")).toBe("1");
    act(() => shortcut.handler(new KeyboardEvent("keydown")));
    expect(readout("shortcut")).toBe("2");

    view.unmount();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("visibility updates", () => {
    const { api, mocks, unsubscribe, setVisible } = makeApi();
    const view = render(ui(api));
    expect(mocks.subscribeVisible).toHaveBeenCalledTimes(1);
    expect(readout("visible")).toBe("visible");

    act(() => setVisible(false));
    expect(readout("visible")).toBe("hidden");
    act(() => setVisible(true));
    expect(readout("visible")).toBe("visible");

    expect(unsubscribe).not.toHaveBeenCalled();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("the hook follows the real window", () => {
    // The fake api keeps saying "visible"; only the hook reads the store.
    const { api } = makeApi();
    act(() => void os.windows.openApp("hello"));
    render(ui(api));
    expect(readout("hook")).toBe("visible");

    act(() => os.windows.minimizeWindow("hello"));
    expect(readout("hook")).toBe("hidden");
    expect(readout("visible")).toBe("visible");
  });

  it("the counter keeps state across renders", () => {
    const { api } = makeApi();
    const { rerender } = render(ui(api, { name: "Ann" }));
    expect(button("Pressed 0")).toBeTruthy();
    fireEvent.click(button("Pressed 0"));
    fireEvent.click(button("Pressed 1"));
    expect(button("Pressed 2")).toBeTruthy();

    rerender(ui(api, { name: "Bo" }));
    expect(button("Pressed 2")).toBeTruthy();
  });
});
