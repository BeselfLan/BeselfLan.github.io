"use client";

import { useKernel } from "@/os/apps/kernel";
import { chromeOf, renderContent } from "@/os/apps/registry";
import { BootSequence, DesktopStage } from "@/os/boot/BootSequence";
import { Desktop } from "@/os/desktop/Desktop";
import { Laptop } from "@/os/screen/Laptop";
import { Screen } from "@/os/screen/Screen";
import { WindowLayer } from "@/os/window/WindowLayer";

// The page is a client component because it passes functions to WindowLayer,
// and a server component cannot. The server HTML is the boot screen: nothing
// below reads the clock, the URL or storage while rendering (plan 9).
export default function Home() {
  useKernel();
  return (
    <main className="fixed inset-0 overflow-hidden">
      <h1 className="sr-only">BeselfOS, the portfolio of Beself Lan</h1>
      <Laptop>
        <Screen>
          <DesktopStage>
            {/* The page owns this wrapper, so the tests never depend on
                markup inside Desktop. It adds no z-index and no isolate. */}
            <div data-desktop="" className="absolute inset-0">
              <Desktop>
                <WindowLayer
                  chromeOf={chromeOf}
                  renderContent={renderContent}
                />
              </Desktop>
            </div>
          </DesktopStage>
          <BootSequence />
        </Screen>
      </Laptop>
    </main>
  );
}
