import styles from "./probe.module.css";

// Dev-only probe for #86 (a route under `next dev` only, like /e2e-harness/).
// A CSS Module must give `styles.probe` a hashed name and keep the bare
// `.probe` away from the second paragraph; a Tailwind utility must still
// compile. tests/e2e/smoke.spec.ts reads the three colours.
export default function Page() {
  return (
    <main>
      <p data-css-module-probe="" className={styles.probe}>
        module
      </p>
      <p data-css-raw-probe="" className="probe">
        raw
      </p>
      <p data-tailwind-probe="" className="text-os-orange">
        tailwind
      </p>
    </main>
  );
}
