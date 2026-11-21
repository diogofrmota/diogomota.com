"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import {
  AddSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  MoreIcon,
  ShareIcon,
} from "@/components/common/icons";
import styles from "./HomeScreenGuide.module.css";

type Screen = "page" | "more" | "menu" | "share" | "add" | "home";

/** The steps, in Safari on an iPhone (iOS 26; older versions have Share in the bar, no ⋯). */
const steps: { screen: Screen; title: string; text: string }[] = [
  {
    screen: "page",
    title: "Open diogomota.com in Safari",
    text: "Log in first, so it opens straight on your apps.",
  },
  {
    screen: "more",
    title: "Tap ⋯ next to the address",
    text: "At the bottom of the screen, on the right. On iOS 18 or earlier, tap Share (the square with an arrow) and skip the next step.",
  },
  {
    screen: "menu",
    title: "Tap Share",
    text: "It’s at the top of the menu that opens.",
  },
  {
    screen: "share",
    title: "Tap Add to Home Screen",
    text: "Scroll down the list to find it. If it isn’t there, tap View More.",
  },
  {
    screen: "add",
    title: "Keep Open as Web App on, then tap Add",
    text: "You can change the name under the icon first, if you like.",
  },
  {
    screen: "home",
    title: "Open it from your Home Screen",
    text: "It opens full screen, without Safari’s bars, like an app of its own.",
  },
];

/** Safari's bar along the bottom: back, the address, and ⋯. */
function SafariBar({ target }: { target?: "address" | "more" }) {
  return (
    <div className={styles.safariBar}>
      <span className={styles.round}>
        <ChevronLeftIcon />
      </span>
      <span className={`${styles.address} ${target === "address" ? styles.target : ""}`}>diogomota.com</span>
      <span className={`${styles.round} ${target === "more" ? styles.target : ""}`}>
        <MoreIcon />
      </span>
    </div>
  );
}

/** The front page, roughly: lines for words, and its two buttons. */
function PageBehind() {
  return (
    <div className={styles.page}>
      <span className={styles.line} style={{ width: "80%", height: "1.1em" }} />
      <span className={styles.line} style={{ width: "55%", height: "1.1em" }} />
      <span className={styles.line} style={{ width: "70%" }} />
      <span className={styles.buttons}>
        <span className={styles.pill} />
        <span className={`${styles.pill} ${styles.plain}`} />
      </span>
      <span className={styles.card} />
      <span className={styles.card} />
    </div>
  );
}

/** An iPhone, drawn: what the screen shows at a step, with what to tap ringed. Decorative: the words say it. */
function Phone({ screen }: { screen: Screen }) {
  let content: React.ReactNode;
  if (screen === "page" || screen === "more") {
    content = (
      <>
        <PageBehind />
        <SafariBar target={screen === "page" ? "address" : "more"} />
      </>
    );
  } else if (screen === "menu") {
    content = (
      <>
        <PageBehind />
        <span className={styles.dim} />
        <div className={styles.menu}>
          <span className={`${styles.menuRow} ${styles.target}`}>
            Share
            <ShareIcon />
          </span>
          <span className={styles.menuRow}>
            <span className={styles.line} style={{ width: "60%" }} />
          </span>
          <span className={styles.menuRow}>
            <span className={styles.line} style={{ width: "45%" }} />
          </span>
          <span className={styles.menuRow}>
            <span className={styles.line} style={{ width: "55%" }} />
          </span>
        </div>
        <SafariBar />
      </>
    );
  } else if (screen === "share") {
    content = (
      <>
        <PageBehind />
        <span className={styles.dim} />
        <div className={styles.sheet}>
          <span className={styles.sheetHeader}>
            <Image unoptimized src="/apple-icon.png" alt="" width={40} height={40} className={styles.siteIcon} />
            <span>
              <strong>diogo mota</strong>
              <span>diogomota.com</span>
            </span>
          </span>
          <span className={styles.contacts}>
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className={styles.sheetRow}>
            Copy
            <CopyIcon />
          </span>
          <span className={`${styles.sheetRow} ${styles.target}`}>
            Add to Home Screen
            <AddSquareIcon />
          </span>
          <span className={styles.sheetRow}>
            <span className={styles.line} style={{ width: "50%" }} />
          </span>
        </div>
      </>
    );
  } else if (screen === "add") {
    content = (
      <div className={styles.addScreen}>
        <span className={styles.addBar}>
          <span>Cancel</span>
          <strong>Add to Home Screen</strong>
          <span className={`${styles.addButton} ${styles.target}`}>Add</span>
        </span>
        <span className={styles.addCard}>
          <Image unoptimized src="/apple-icon.png" alt="" width={40} height={40} className={styles.siteIcon} />
          <span>
            <strong>diogo mota</strong>
            <span>diogomota.com</span>
          </span>
        </span>
        <span className={styles.addCard}>
          <span>Open as Web App</span>
          <span className={styles.toggle} />
        </span>
      </div>
    );
  } else {
    content = (
      <div className={styles.homeScreen}>
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className={styles.homeApp} />
        ))}
        <span className={`${styles.homeApp} ${styles.ours}`}>
          <Image unoptimized src="/apple-icon.png" alt="" width={40} height={40} className={styles.target} />
          <span>diogo mota</span>
        </span>
      </div>
    );
  }
  return (
    <div className={styles.phone} aria-hidden="true">
      <div className={styles.screen}>
        <span className={styles.island} />
        <span className={styles.status}>
          <span>9:41</span>
          <span className={styles.battery} />
        </span>
        {content}
      </div>
    </div>
  );
}

/**
 * The front page's How to add to Home Screen: the steps in Safari on an
 * iPhone, a slide each (a drawing of the phone at that step, with what to tap
 * ringed, then the step in words). Swiped, scrolled, or moved with ‹ and ›
 * (a finger's size) or the arrow keys, Home and End; the dots under it, one a
 * step, follow whichever is showing.
 */
export function HomeScreenGuide() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function go(to: number) {
    const element = track.current;
    if (!element) return;
    const next = Math.max(0, Math.min(steps.length - 1, to));
    setIndex(next);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ left: next * element.clientWidth, behavior: still ? "auto" : "smooth" });
  }

  return (
    <div className={styles.guide}>
      <div
        ref={track}
        className={styles.track}
        role="group"
        aria-label="Steps"
        tabIndex={0}
        onScroll={(event) => {
          const element = event.currentTarget;
          setIndex(Math.round(element.scrollLeft / Math.max(1, element.clientWidth)));
        }}
        onKeyDown={(event) => {
          const keys: Record<string, number> = {
            ArrowLeft: index - 1,
            ArrowRight: index + 1,
            Home: 0,
            End: steps.length - 1,
          };
          if (!Object.hasOwn(keys, event.key)) return;
          event.preventDefault();
          go(keys[event.key]);
        }}
      >
        {steps.map((step, i) => (
          <div
            key={step.screen}
            className={styles.slide}
            role="group"
            aria-roledescription="slide"
            aria-label={`Step ${i + 1} of ${steps.length}`}
          >
            <Phone screen={step.screen} />
            <div className={styles.words}>
              <p className={styles.stepLabel} aria-hidden="true">
                Step {i + 1} of {steps.length}
              </p>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.arrow}
          aria-label="Previous step"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <ChevronLeftIcon />
        </button>
        {/* Where it is: a dot a step, the one showing long (the slides say it in words). */}
        <div className={styles.dots} aria-hidden="true">
          {steps.map((step, i) => (
            <span key={step.screen} className={styles.dot} data-current={i === index || undefined} />
          ))}
        </div>
        <button
          type="button"
          className={styles.arrow}
          aria-label="Next step"
          disabled={index === steps.length - 1}
          onClick={() => go(index + 1)}
        >
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}
