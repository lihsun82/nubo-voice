"use client";

import {
  useState,
  type CSSProperties,
} from "react";

type Operator =
  | "+"
  | "-"
  | "×"
  | "÷"
  | null;

function calculate(
  left: number,
  right: number,
  operator: Operator,
) {
  if (operator === "+")
    return left + right;

  if (operator === "-")
    return left - right;

  if (operator === "×")
    return left * right;

  if (operator === "÷") {
    if (right === 0) {
      throw new Error(
        "不能除以零",
      );
    }

    return left / right;
  }

  return right;
}

function formatNumber(
  value: number,
) {
  if (!Number.isFinite(value)) {
    return "錯誤";
  }

  return String(
    Number(
      value.toPrecision(12),
    ),
  );
}

const pageStyle:
  CSSProperties = {
    minHeight: "100dvh",
    background:
      "radial-gradient(circle at top, #202c59 0%, #0b1022 48%, #050711 100%)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    fontFamily:
      "system-ui, sans-serif",
  };

const calculatorStyle:
  CSSProperties = {
    width: "min(100%, 390px)",
    borderRadius: 28,
    padding: 20,
    background:
      "rgba(12, 17, 38, 0.92)",
    border:
      "1px solid rgba(255,255,255,0.13)",
    boxShadow:
      "0 28px 80px rgba(0,0,0,0.45)",
  };

const displayStyle:
  CSSProperties = {
    minHeight: 108,
    borderRadius: 20,
    padding: "20px 18px",
    marginBottom: 16,
    background:
      "rgba(255,255,255,0.06)",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    fontSize: 42,
    fontWeight: 650,
    overflowWrap: "anywhere",
    textAlign: "right",
  };

const gridStyle:
  CSSProperties = {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, 1fr)",
    gap: 11,
  };

export default function MobileCalculatorPage() {
  const [display, setDisplay] =
    useState("0");

  const [
    storedValue,
    setStoredValue,
  ] = useState<number | null>(
    null,
  );

  const [
    operator,
    setOperator,
  ] = useState<Operator>(null);

  const [
    replaceDisplay,
    setReplaceDisplay,
  ] = useState(true);

  const clear = () => {
    setDisplay("0");
    setStoredValue(null);
    setOperator(null);
    setReplaceDisplay(true);
  };

  const inputDigit = (
    digit: string,
  ) => {
    if (
      replaceDisplay ||
      display === "錯誤"
    ) {
      setDisplay(digit);
      setReplaceDisplay(false);
      return;
    }

    if (display.length >= 15) {
      return;
    }

    setDisplay(
      display === "0"
        ? digit
        : display + digit,
    );
  };

  const inputDecimal = () => {
    if (
      replaceDisplay ||
      display === "錯誤"
    ) {
      setDisplay("0.");
      setReplaceDisplay(false);
      return;
    }

    if (!display.includes(".")) {
      setDisplay(display + ".");
    }
  };

  const chooseOperator = (
    nextOperator: Operator,
  ) => {
    const current =
      Number(display);

    if (
      !Number.isFinite(current)
    ) {
      clear();
      return;
    }

    try {
      if (
        storedValue !== null &&
        operator &&
        !replaceDisplay
      ) {
        const result =
          calculate(
            storedValue,
            current,
            operator,
          );

        setStoredValue(result);
        setDisplay(
          formatNumber(result),
        );
      } else {
        setStoredValue(current);
      }

      setOperator(
        nextOperator,
      );

      setReplaceDisplay(true);
    } catch {
      setDisplay("錯誤");
      setStoredValue(null);
      setOperator(null);
      setReplaceDisplay(true);
    }
  };

  const equals = () => {
    if (
      storedValue === null ||
      !operator
    ) {
      return;
    }

    try {
      const result =
        calculate(
          storedValue,
          Number(display),
          operator,
        );

      setDisplay(
        formatNumber(result),
      );

      setStoredValue(null);
      setOperator(null);
      setReplaceDisplay(true);
    } catch {
      setDisplay("錯誤");
      setStoredValue(null);
      setOperator(null);
      setReplaceDisplay(true);
    }
  };

  const toggleSign = () => {
    const current =
      Number(display);

    if (
      Number.isFinite(current)
    ) {
      setDisplay(
        formatNumber(
          current * -1,
        ),
      );
    }
  };

  const percent = () => {
    const current =
      Number(display);

    if (
      Number.isFinite(current)
    ) {
      setDisplay(
        formatNumber(
          current / 100,
        ),
      );
    }
  };

  const keys = [
    "C",
    "±",
    "%",
    "÷",
    "7",
    "8",
    "9",
    "×",
    "4",
    "5",
    "6",
    "-",
    "1",
    "2",
    "3",
    "+",
    "0",
    ".",
    "=",
  ];

  const handleKey = (
    key: string,
  ) => {
    if (/^\d$/.test(key)) {
      inputDigit(key);
      return;
    }

    if (key === ".") {
      inputDecimal();
      return;
    }

    if (key === "C") {
      clear();
      return;
    }

    if (key === "±") {
      toggleSign();
      return;
    }

    if (key === "%") {
      percent();
      return;
    }

    if (
      ["+", "-", "×", "÷"]
        .includes(key)
    ) {
      chooseOperator(
        key as Operator,
      );
      return;
    }

    if (key === "=") {
      equals();
    }
  };

  return (
    <main style={pageStyle}>
      <section
        style={calculatorStyle}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div>
            <strong
              style={{
                fontSize: 19,
              }}
            >
              NUBO 計算機
            </strong>
            <div
              style={{
                opacity: 0.65,
                fontSize: 12,
                marginTop: 3,
              }}
            >
              手機內建工具
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (
                window.history.length >
                1
              ) {
                window.history.back();
              } else {
                window.location.href =
                  "/";
              }
            }}
            style={{
              border: 0,
              borderRadius: 999,
              padding: "9px 13px",
              background:
                "rgba(255,255,255,0.1)",
              color: "#fff",
            }}
          >
            返回 NUBO
          </button>
        </div>

        <div
          aria-live="polite"
          style={displayStyle}
        >
          {display}
        </div>

        <div style={gridStyle}>
          {keys.map((key) => {
            const isOperator =
              [
                "÷",
                "×",
                "-",
                "+",
                "=",
              ].includes(key);

            const isUtility =
              [
                "C",
                "±",
                "%",
              ].includes(key);

            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  handleKey(key)
                }
                style={{
                  minHeight: 65,
                  border: 0,
                  borderRadius: 18,
                  fontSize: 24,
                  fontWeight: 650,
                  color: "#fff",
                  background:
                    isOperator
                      ? "linear-gradient(145deg, #7357ff, #3e7bff)"
                      : isUtility
                        ? "rgba(255,255,255,0.16)"
                        : "rgba(255,255,255,0.08)",
                  gridColumn:
                    key === "0"
                      ? "span 2"
                      : undefined,
                  cursor: "pointer",
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
