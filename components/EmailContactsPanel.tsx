"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
} from "react";

const STORAGE_KEY =
  "nubo_email_contacts_v1";

type EmailContact = {
  id: string;
  name: string;
  email: string;
  aliases: string[];
};

const fieldStyle: CSSProperties = {
  width: "100%",
  minHeight: "46px",
  padding: "11px 13px",
  borderRadius: "12px",
  border:
    "1px solid rgba(148,163,184,0.35)",
  background:
    "rgba(15,23,42,0.45)",
  color: "inherit",
  fontSize: "16px",
  boxSizing: "border-box",
};

const buttonStyle: CSSProperties = {
  minHeight: "44px",
  padding: "10px 16px",
  borderRadius: "12px",
  border:
    "1px solid rgba(139,92,246,0.65)",
  background:
    "rgba(109,40,217,0.75)",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const deleteButtonStyle:
  CSSProperties = {
    ...buttonStyle,
    border:
      "1px solid rgba(239,68,68,0.5)",
    background:
      "rgba(127,29,29,0.55)",
  };

function normalizeKey(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "");
}

function readContacts():
  EmailContact[] {
  try {
    const raw =
      window.localStorage.getItem(
        STORAGE_KEY,
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (
        item,
      ): item is EmailContact =>
        Boolean(
          item &&
            typeof item.id ===
              "string" &&
            typeof item.name ===
              "string" &&
            typeof item.email ===
              "string" &&
            Array.isArray(
              item.aliases,
            ),
        ),
    );
  } catch {
    return [];
  }
}

function writeContacts(
  contacts: EmailContact[],
) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(contacts),
  );
}

export default function EmailContactsPanel() {
  const [
    contacts,
    setContacts,
  ] = useState<EmailContact[]>([]);

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [aliases, setAliases] =
    useState("");

  const [message, setMessage] =
    useState(
      "聯絡人只儲存在目前這支手機的NUBO。",
    );

  useEffect(() => {
    setContacts(readContacts());
  }, []);

  const saveContact = () => {
    const cleanName =
      name.trim();

    const cleanEmail =
      email.trim().toLowerCase();

    if (!cleanName) {
      setMessage(
        "請輸入聯絡人名稱。",
      );
      return;
    }

    if (
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/
        .test(cleanEmail)
    ) {
      setMessage(
        "Email格式不正確。",
      );
      return;
    }

    const cleanAliases =
      Array.from(
        new Set(
          aliases
            .split(
              /[,，、\n]+/,
            )
            .map(
              (item) =>
                item.trim(),
            )
            .filter(Boolean),
        ),
      );

    const existing =
      contacts.find(
        (contact) =>
          normalizeKey(
            contact.name,
          ) ===
          normalizeKey(
            cleanName,
          ),
      );

    let next:
      EmailContact[];

    if (existing) {
      next = contacts.map(
        (contact) =>
          contact.id ===
          existing.id
            ? {
                ...contact,
                name: cleanName,
                email:
                  cleanEmail,
                aliases:
                  cleanAliases,
              }
            : contact,
      );
    } else {
      const id =
        typeof crypto !==
          "undefined" &&
        "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(
              Date.now(),
            );

      next = [
        ...contacts,
        {
          id,
          name: cleanName,
          email: cleanEmail,
          aliases:
            cleanAliases,
        },
      ];
    }

    next.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "zh-Hant",
        ),
    );

    writeContacts(next);
    setContacts(next);

    setName("");
    setEmail("");
    setAliases("");

    setMessage(
      existing
        ? `已更新：${cleanName}`
        : `已新增：${cleanName}`,
    );
  };

  const removeContact = (
    contact: EmailContact,
  ) => {
    const confirmed =
      window.confirm(
        `確定刪除「${contact.name}」？`,
      );

    if (!confirmed) {
      return;
    }

    const next =
      contacts.filter(
        (item) =>
          item.id !==
          contact.id,
      );

    writeContacts(next);
    setContacts(next);

    setMessage(
      `已刪除：${contact.name}`,
    );
  };

  return (
    <section className="nubo-page-grid">
      <div className="nubo-panel nubo-full-panel">
        <div className="nubo-panel-head">
          <div>
            <h2>
              Gmail 固定聯絡人
            </h2>
            <span>
              Email Contact Aliases
            </span>
          </div>
        </div>

        <p
          style={{
            marginBottom: "18px",
            opacity: 0.8,
          }}
        >
          新增後可以直接對NUBO說：
          「寄信給聯絡人名稱」。
          正式寄出前仍需要語音確認。
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "12px",
          }}
        >
          <label>
            <div
              style={{
                marginBottom: "6px",
              }}
            >
              名稱
            </div>

            <input
              value={name}
              onChange={(event) =>
                setName(
                  event.target.value,
                )
              }
              placeholder="例如：耀呈"
              autoComplete="off"
              style={fieldStyle}
            />
          </label>

          <label>
            <div
              style={{
                marginBottom: "6px",
              }}
            >
              Email
            </div>

            <input
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              placeholder="name@gmail.com"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              style={fieldStyle}
            />
          </label>

          <label>
            <div
              style={{
                marginBottom: "6px",
              }}
            >
              別名
            </div>

            <input
              value={aliases}
              onChange={(event) =>
                setAliases(
                  event.target.value,
                )
              }
              placeholder="例如：老大、大兒子"
              autoComplete="off"
              style={fieldStyle}
            />
          </label>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "12px",
            marginTop: "16px",
          }}
        >
          <button
            type="button"
            style={buttonStyle}
            onClick={saveContact}
          >
            儲存固定聯絡人
          </button>

          <span
            style={{
              opacity: 0.8,
            }}
          >
            {message}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gap: "10px",
            marginTop: "20px",
          }}
        >
          {contacts.length === 0 ? (
            <div
              style={{
                padding: "16px",
                borderRadius:
                  "14px",
                border:
                  "1px dashed rgba(148,163,184,0.35)",
                opacity: 0.75,
              }}
            >
              尚未新增固定聯絡人。
            </div>
          ) : (
            contacts.map(
              (contact) => (
                <div
                  key={
                    contact.id
                  }
                  style={{
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center",
                    flexWrap:
                      "wrap",
                    gap: "12px",
                    padding:
                      "14px",
                    borderRadius:
                      "14px",
                    border:
                      "1px solid rgba(148,163,184,0.25)",
                    background:
                      "rgba(15,23,42,0.28)",
                  }}
                >
                  <div>
                    <strong>
                      {
                        contact.name
                      }
                    </strong>

                    <div
                      style={{
                        marginTop:
                          "4px",
                        overflowWrap:
                          "anywhere",
                      }}
                    >
                      {
                        contact.email
                      }
                    </div>

                    {contact
                      .aliases
                      .length > 0 ? (
                      <small
                        style={{
                          display:
                            "block",
                          marginTop:
                            "4px",
                          opacity:
                            0.7,
                        }}
                      >
                        別名：
                        {contact.aliases.join(
                          "、",
                        )}
                      </small>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    style={
                      deleteButtonStyle
                    }
                    onClick={() =>
                      removeContact(
                        contact,
                      )
                    }
                  >
                    刪除
                  </button>
                </div>
              ),
            )
          )}
        </div>
      </div>
    </section>
  );
}
