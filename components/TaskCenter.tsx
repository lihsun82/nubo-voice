"use client";

import { useEffect, useState } from "react";

export function TaskCenter() {
  const [message, setMessage] = useState("任務中心準備中");

  useEffect(() => {
    setMessage("任務中心已啟用");
  }, []);

  return <section className="task-center">{message}</section>;
}
