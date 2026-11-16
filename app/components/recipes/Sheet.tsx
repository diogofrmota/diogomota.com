"use client";
import { useId } from "react";
import { Dialog } from "@/components/common/Dialog";
import { CloseIcon } from "@/components/common/icons";
import styles from "./Recipes.module.css";

/**
 * A popup of the Recipes app (components/common/Dialog): its title and a ×
 * over what is in it, which scrolls inside it past the screen's height.
 * `wide` for a recipe's page.
 */
export function Sheet({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const heading = useId();
  return (
    <Dialog className={`${styles.dialog} ${wide ? styles.wide : ""}`} aria-labelledby={heading} onClose={onClose}>
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}>
          <h2 id={heading}>{title}</h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </Dialog>
  );
}
