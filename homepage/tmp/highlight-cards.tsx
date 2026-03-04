import { useState, useRef, useCallback, useEffect } from "react";

const PALETTE = [
  "#EDDCB0", "#B0D4ED", "#EDC4B0", "#B0EDCD", "#D1B0ED",
  "#EDD1B0", "#B0E4ED", "#E8B0C8",
];
let colorIdx = 0;
const nextColor = () => PALETTE[colorIdx++ % PALETTE.length];

const SAMPLE = `Design is not just what it looks like and feels like. Design is how it works. The details are not the details — they make the design. Good design is obvious. Great design is transparent.\n\nWhite space is to be regarded as an active element, not a passive background. Typography exists to honor content. The real issue is not whether machines think but whether men do.\n\nLess is more, but only when more is too much. Simplicity is the ultimate sophistication. Every great design begins with an even better story, and the best stories never stop unfolding.`;

export default function HighlightCards() {
  const editorRef = useRef(null);
  const wrapperRef = useRef(null);
  const draggedRef = useRef(null);
  const [popup, setPopup] = useState(null);
  const [cardCount, setCardCount] = useState(0);
  const [hint, setHint] = useState(true);

  const recount = useCallback(() => {
    if (!editorRef.current) return;
    setCardCount(editorRef.current.querySelectorAll(".hcard").length);
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = SAMPLE.replace(/\n\n/g, "<br><br>");
    const t = setTimeout(() => setHint(false), 5000);
    return () => clearTimeout(t);
  }, []);

  /* ---- Selection → popup ---- */
  const checkSelection = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (
        !sel ||
        sel.isCollapsed ||
        !sel.toString().trim() ||
        !editorRef.current
      ) {
        setPopup(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // block if already inside a card
      let n = range.commonAncestorContainer;
      while (n && n !== editorRef.current) {
        if (n.classList?.contains("hcard")) {
          setPopup(null);
          return;
        }
        n = n.parentNode;
      }
      const rr = range.getBoundingClientRect();
      const wr = wrapperRef.current.getBoundingClientRect();
      setPopup({
        x: rr.left + rr.width / 2 - wr.left,
        y: rr.top - wr.top - 46,
      });
    }, 10);
  }, []);

  /* ---- Create card ---- */
  const createCard = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const color = nextColor();

    const span = document.createElement("span");
    span.className = "hcard";
    span.draggable = true;
    span.dataset.color = color;
    span.style.cssText = [
      `background:${color}`,
      "box-decoration-break:clone",
      "-webkit-box-decoration-break:clone",
      "padding:3px 6px",
      "border-radius:5px",
      "cursor:grab",
      "line-height:2.1",
      "transition:filter .2s,box-shadow .2s",
      `box-shadow:0 2px 8px ${color}66`,
    ].join(";");

    try {
      const frag = range.extractContents();
      span.appendChild(frag);
    } catch {
      const text = range.toString();
      range.deleteContents();
      span.textContent = text;
    }

    // x button
    const x = document.createElement("span");
    x.className = "hcard-x";
    x.contentEditable = "false";
    x.textContent = "×";
    x.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "width:18px",
      "height:18px",
      "font-size:13px",
      "border-radius:50%",
      "background:rgba(0,0,0,0.12)",
      "color:rgba(0,0,0,0.45)",
      "cursor:pointer",
      "margin-left:5px",
      "vertical-align:middle",
      "user-select:none",
      "opacity:0",
      "transition:opacity .2s,background .15s",
      "flex-shrink:0",
    ].join(";");

    x.onmouseenter = () => (x.style.background = "rgba(0,0,0,0.22)");
    x.onmouseleave = () => (x.style.background = "rgba(0,0,0,0.12)");
    x.onclick = (e) => {
      e.stopPropagation();
      const parent = span.parentNode;
      while (span.firstChild) {
        if (span.firstChild === x) {
          span.removeChild(x);
        } else {
          parent.insertBefore(span.firstChild, span);
        }
      }
      parent.removeChild(span);
      parent.normalize();
      recount();
    };
    span.appendChild(x);

    // hover show x
    span.onmouseenter = () => (x.style.opacity = "1");
    span.onmouseleave = () => (x.style.opacity = "0");

    range.insertNode(span);
    sel.removeAllRanges();
    setPopup(null);
    recount();
  }, [recount]);

  /* ---- Drag & Drop ---- */
  const onDragStart = useCallback((e) => {
    const card = e.target.closest?.(".hcard");
    if (!card) return;
    draggedRef.current = card;
    card.style.opacity = "0.35";
    card.style.filter = "grayscale(0.3)";
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
  }, []);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const card = draggedRef.current;
      if (!card) return;
      card.style.opacity = "1";
      card.style.filter = "";

      let range;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(e.clientX, e.clientY);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }

      if (range) {
        let node = range.startContainer;
        while (node && node !== editorRef.current) {
          if (node === card || node.classList?.contains("hcard")) {
            draggedRef.current = null;
            return;
          }
          node = node.parentNode;
        }
        card.parentNode.removeChild(card);
        range.insertNode(card);
        editorRef.current.normalize();
      }
      draggedRef.current = null;
      recount();
    },
    [recount]
  );

  const onDragEnd = useCallback(() => {
    if (draggedRef.current) {
      draggedRef.current.style.opacity = "1";
      draggedRef.current.style.filter = "";
      draggedRef.current = null;
    }
  }, []);

  /* ---- Input: remove empty cards ---- */
  const onInput = useCallback(() => {
    if (!editorRef.current) return;
    editorRef.current.querySelectorAll(".hcard").forEach((card) => {
      const txt = Array.from(card.childNodes)
        .filter((n) => !n.classList?.contains("hcard-x"))
        .map((n) => n.textContent)
        .join("")
        .trim();
      if (!txt) card.parentNode?.removeChild(card);
    });
    recount();
  }, [recount]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F5F2ED",
        fontFamily: "'Lora', 'Georgia', serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes popIn { from { opacity:0; transform:translate(-50%,4px) scale(0.92); } to { opacity:1; transform:translate(-50%,0) scale(1); } }
        @keyframes hintFade { 0%,80% { opacity:1; } 100% { opacity:0; } }
        .hcard:hover { filter:brightness(1.03) !important; box-shadow:0 4px 16px rgba(0,0,0,0.1) !important; }
        .hcard:active { cursor:grabbing !important; }
        .editor-area::selection { background:rgba(60,50,40,0.15); }
        .editor-area *::selection { background:rgba(60,50,40,0.15); }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: "44px 48px 0",
          animation: "fadeIn 0.5s ease both",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#A09888",
                marginBottom: 6,
              }}
            >
              Concept Two
            </div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 400,
                color: "#3A3530",
                margin: 0,
              }}
            >
              Highlight Cards
            </h1>
          </div>
          {cardCount > 0 && (
            <div
              style={{
                fontSize: 13,
                color: "#9E9689",
                background: "rgba(0,0,0,0.04)",
                padding: "6px 14px",
                borderRadius: 20,
              }}
            >
              {cardCount} card{cardCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
        <p
          style={{
            fontSize: 14,
            color: "#8A8279",
            marginTop: 10,
            lineHeight: 1.6,
            maxWidth: 520,
          }}
        >
          Select any text below, then click{" "}
          <span
            style={{
              background: "#3A3530",
              color: "#F5F2ED",
              padding: "1px 8px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            Create Card
          </span>{" "}
          to turn it into a draggable highlight. Drag cards to reposition them.
          Hover to reveal the × button.
        </p>
      </div>

      {/* Editor */}
      <div
        ref={wrapperRef}
        style={{
          position: "relative",
          margin: "24px 48px 48px",
          animation: "fadeIn 0.5s ease 0.15s both",
        }}
      >
        {/* Popup */}
        {popup && (
          <button
            onClick={createCard}
            style={{
              position: "absolute",
              left: popup.x,
              top: popup.y,
              transform: "translate(-50%, 0)",
              zIndex: 100,
              background: "#3A3530",
              color: "#F5F2ED",
              border: "none",
              padding: "8px 18px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.15)",
              animation: "popIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both",
              whiteSpace: "nowrap",
              letterSpacing: "0.02em",
            }}
          >
            Create Card
          </button>
        )}

        {/* Hint overlay */}
        {hint && cardCount === 0 && (
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: "rgba(58,53,48,0.88)",
              color: "#F5F2ED",
              fontSize: 12,
              padding: "8px 14px",
              borderRadius: 10,
              zIndex: 50,
              pointerEvents: "none",
              animation: "hintFade 5s ease both",
              maxWidth: 180,
              lineHeight: 1.5,
            }}
          >
            Try selecting some text to get started
          </div>
        )}

        <div
          ref={editorRef}
          className="editor-area"
          contentEditable
          suppressContentEditableWarning
          onMouseUp={checkSelection}
          onKeyUp={checkSelection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onInput={onInput}
          onBlur={() => setTimeout(() => setPopup(null), 200)}
          style={{
            minHeight: 300,
            padding: "36px 40px",
            background: "#FEFCF8",
            border: "1px solid rgba(0,0,0,0.07)",
            borderRadius: 14,
            fontSize: 17,
            lineHeight: 2.1,
            color: "#3A3530",
            outline: "none",
            boxShadow:
              "0 2px 12px rgba(0,0,0,0.04), inset 0 1px 3px rgba(0,0,0,0.02)",
            caretColor: "#8A7A68",
            overflowWrap: "break-word",
          }}
        />
      </div>
    </div>
  );
}