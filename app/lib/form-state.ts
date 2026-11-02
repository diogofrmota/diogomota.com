// What a form's server action returns to useActionState.
export type FormState = {
  /** About the whole form, shown above its submit button. */
  error?: string;
  /** Shown after a change was saved. */
  success?: string;
  /** Per field, keyed by input name. */
  fieldErrors?: Record<string, string | undefined>;
  /** Submitted values to put back in the form (never passwords). */
  values?: Record<string, string>;
};
