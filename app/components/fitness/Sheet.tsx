"use client";
import { Sheet as StyledSheet, type SheetProps } from "@/components/common/Sheet";
import styles from "./Fitness.module.css";

export function Sheet(props: SheetProps) {
  return <StyledSheet {...props} styles={styles} />;
}
