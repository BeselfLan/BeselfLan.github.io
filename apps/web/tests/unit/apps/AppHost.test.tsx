import {
  lazy,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppHost, createRenderContent } from "@/os/apps/AppHost";
import {
  defineApp,
  type AnyAppDefinition,
  type AppDefinition,
  type AppProps,
} from "@/os/apps/types";
import { os, useOS } from "@/os/store";

type Args = { name: string };

const registry = new Map<string, AnyAppDefinition>();
const lookup = (id: string) => registry.get(id);

function addApp<A>(
  id: string,
  component: AppDefinition<A>["component"],
  over: Partial<AppDefinition<A>> = {},
): void {
  registry.set(
    id,
    defineApp<A>({
      id,
      name: `${id} app`,
      icon: "",
      window: { width: 400, height: 300, resizable: false },
      capabilities: { minimize: true, maximize: false, close: true },
      singleton: true,
      dock: null,
      showInAppGrid: false,
      component,
      ...over,
    }),
  );
}
const loaded = <A,>(Comp: ComponentType<AppProps<A>>) =>
  lazy<ComponentType<AppProps<A>>>(() => Promise.resolve({ default: Comp }));

const open = (id: string, args?: unknown) =>
  act(() => {
    os.windows.openApp(id, args);
  });
const hostOf = (id: string) => <AppHost windowId={id} lookup={lookup} />;
const silenceErrors = () =>
  vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  registry.clear();
  localStorage.clear();
  useOS.setState(useOS.getInitialState(), true);
  os.windows.setAppLookup(lookup);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("AppHost", () => {
  it("shows a skeleton until the app loads", async () => {
    let resolve!: (m: { default: ComponentType<AppProps<Args>> }) => void;
    const pending = new Promise<{ default: ComponentType<AppProps<Args>> }>(
      (r) => {
        resolve = r;
      },
    );
    addApp<Args>(
      "a",
      lazy(() => pending),
    );
    open("a");
    const { container } = render(hostOf("a"));
    expect(container.querySelector("[data-app-skeleton]")).not.toBeNull();
    expect(screen.queryByText("loaded app")).toBeNull();

    await act(async () => resolve({ default: () => <p>loaded app</p> }));
    expect(await screen.findByText("loaded app")).toBeTruthy();
    expect(container.querySelector("[data-app-skeleton]")).toBeNull();
  });

  it("the app gets windowId, args and api", async () => {
    addApp<Args>(
      "a",
      loaded<Args>(({ windowId, args, api }) => (
        <div>
          <p>{`${args.name} in ${windowId}`}</p>
          <button onClick={() => api.setTitle("T")}>retitle</button>
        </div>
      )),
    );
    open("a", { name: "Ada" });
    render(hostOf("a"));
    expect(await screen.findByText("Ada in a")).toBeTruthy();
    fireEvent.click(screen.getByText("retitle"));
    expect(useOS.getState().windows.items[0].title).toBe("T");
  });

  it("args come from the window", async () => {
    addApp<Args>(
      "a",
      loaded<Args>(({ args }) => <p>{`hello ${args.name}`}</p>),
    );
    open("a", { name: "A" });
    render(hostOf("a"));
    expect(await screen.findByText("hello A")).toBeTruthy();
    open("a", { name: "B" });
    expect(screen.getByText("hello B")).toBeTruthy();
    expect(screen.queryByText("hello A")).toBeNull();
  });

  it("the last args stay through the close fade", async () => {
    const error = silenceErrors();
    addApp<Args>(
      "a",
      loaded<Args>(({ args }) => <p>{`hello ${args.name}`}</p>),
    );
    open("a", { name: "A" });
    render(hostOf("a"));
    expect(await screen.findByText("hello A")).toBeTruthy();

    // The window is gone from the store, and the host is still mounted.
    act(() => void os.windows.closeWindow("a"));
    expect(useOS.getState().windows.items).toHaveLength(0);
    expect(screen.getByText("hello A")).toBeTruthy();
    expect(error).not.toHaveBeenCalled();
  });

  it("an unknown app id shows a message", () => {
    const error = silenceErrors();
    addApp<Args>(
      "ghost",
      loaded<Args>(() => null),
    );
    open("ghost");
    // The store knows the app, the host's lookup does not.
    expect(() =>
      render(<AppHost windowId="ghost" lookup={() => undefined} />),
    ).not.toThrow();
    expect(screen.getByRole("alert").textContent).toContain("ghost");
    expect(error).not.toHaveBeenCalled();
  });

  it("createRenderContent renders a host for a window id", async () => {
    addApp<Args>(
      "a",
      loaded<Args>(() => <p>from the factory</p>),
    );
    open("a");
    const renderContent = createRenderContent(lookup);
    render(<>{renderContent("a")}</>);
    expect(await screen.findByText("from the factory")).toBeTruthy();
  });
});

describe("a crash", () => {
  function Boom(): ReactNode {
    throw new Error("boom");
  }
  function Counter() {
    const [n, setN] = useState(0);
    return <button onClick={() => setN((v) => v + 1)}>{`count ${n}`}</button>;
  }

  it("stays in its window", async () => {
    silenceErrors();
    addApp<Args>("bad", loaded<Args>(Boom));
    addApp<Args>("good", loaded<Args>(Counter));
    open("bad");
    open("good");
    render(
      <>
        <div data-testid="bad-window">{hostOf("bad")}</div>
        <div data-testid="good-window">{hostOf("good")}</div>
      </>,
    );

    const alert = await within(screen.getByTestId("bad-window")).findByRole(
      "alert",
    );
    expect(alert.textContent).toContain("This app crashed");
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeTruthy();

    // The other window is untouched and still works.
    const good = within(screen.getByTestId("good-window"));
    fireEvent.click(await good.findByText("count 0"));
    expect(good.getByText("count 1")).toBeTruthy();
    expect(
      within(screen.getByTestId("good-window")).queryByRole("alert"),
    ).toBeNull();
  });

  it("pushes one notification", async () => {
    silenceErrors();
    addApp<Args>("bad", loaded<Args>(Boom));
    open("bad");
    render(hostOf("bad"));
    await screen.findByRole("alert");
    const items = useOS.getState().notifications.items;
    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("bad app");
  });

  it("Reload remounts the app", async () => {
    silenceErrors();
    // A flag and not a render count: React renders once more to recover from
    // a throw before it hands the error to the boundary.
    let broken = true;
    let mounts = 0;
    function Flaky() {
      if (broken) throw new Error("boom");
      useEffect(() => {
        mounts++;
      }, []);
      return <p>fresh content</p>;
    }
    addApp<Args>("a", loaded<Args>(Flaky));
    open("a");
    render(hostOf("a"));
    const alert = await screen.findByRole("alert");
    expect(screen.queryByText("fresh content")).toBeNull();

    broken = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
    expect(await screen.findByText("fresh content")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mounts).toBe(1);
  });
});

describe("renders", () => {
  it("a drag does not re-render the app", async () => {
    let commits = 0;
    function Probe() {
      useEffect(() => {
        commits++;
      });
      return <p>probe</p>;
    }
    addApp<Args>("a", loaded<Args>(Probe));
    addApp<Args>(
      "b",
      loaded<Args>(() => null),
    );
    open("a");
    open("b");
    render(hostOf("a"));
    await screen.findByText("probe");
    const before = commits;
    expect(before).toBeGreaterThan(0);

    for (const x of [210, 260, 320]) {
      act(() => os.windows.moveWindow("a", { x, y: 120 }));
    }
    act(() => os.windows.focusWindow("a"));
    act(() => os.windows.focusWindow("b"));
    act(() => os.windows.setTitle("a", "Other title"));
    expect(commits).toBe(before);
  });
});
