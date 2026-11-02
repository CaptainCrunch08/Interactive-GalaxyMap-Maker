import {
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows">;

/** Textarea that grows with its content (no manual resize handle). */
export function AutoGrowTextarea({
  value,
  className,
  style,
  onChange,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const syncHeight = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    syncHeight();
  }, [value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={1}
      value={value}
      className={className}
      style={{ overflow: "hidden", resize: "none", ...style }}
      onChange={(e) => {
        onChange?.(e);
        // Grow immediately while typing; value effect covers controlled updates.
        const el = e.currentTarget;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }}
    />
  );
}
