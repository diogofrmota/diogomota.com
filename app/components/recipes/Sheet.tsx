"use client";
import { Sheet as StyledSheet, type SheetProps } from "@/components/common/Sheet";
import styles from "./Recipes.module.css";

export function Sheet(props: SheetProps) {
  return <StyledSheet {...props} styles={styles} />;
}
