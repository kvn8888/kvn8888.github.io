import { useState, useRef, useCallback, useEffect } from "react";

const CARDS = [
  { id: 1, label: "Aurora", color: "#E8D5B7", accent: "#BFA67A", icon: "◐" },
  { id: 2, label: "Drift", color: "#B7D5E8", accent: "#7AABBF", icon: "◑" },
  { id: 3, label: "Ember", color: "#E8B7B7", accent: "#BF7A7A", icon: "◒" },
  { id: 4, label: "Moss", color: "#B7E8C8", accent: "#7ABF8E", icon: "◓" },
  { id: 5, label: "Slate", color: "#C8C3D6", accent: "#8E86A8", icon: "◔" },
  { id: 6, label: "Dusk", color: "#D6C8B8", accent: "#A8927A", icon: "◕" },
];

const SLOT_COUNT = 4;

export default function FloatingCards() {
  const [placed, setPlaced] = useState({});
  const [dragging, setDragging] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [animatingTo, setAnimatingTo] = useState(null);
  const slotRefs = useRef([]);
  const containerRef = useRef(null);

  const getSlotCenter = (index) => {
    const el = slotRefs.current[index];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const handlePointerDown = (e, card) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragPos({ x: rect.left, y: rect.top });
    setDragging(card);
  };

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragging) return;
      setDragPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });

      let closest = null;
      let closestDist = 120;
      for (let i = 0; i < SLOT_COUNT; i++) {
        const center = getSlotCenter(i);
        if (!center) continue;
        const dist = Math.hypot(e.clientX - center.x, e.clientY - center.y);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      setHoveredSlot(closest);
    },
    [dragging, dragOffset]
  );

  const handlePointerUp = useCallback(() => {
    if (!dragging) return;

    if (hoveredSlot !== null) {
      const newPlaced = { ...placed };
      Object.keys(newPlaced).forEach((k) => {
        if (newPlaced[k] === dragging.id) delete newPlaced[k];
      });
      Object.keys(newPlaced).forEach((k) => {
        if (parseInt(k) === hoveredSlot) delete newPlaced[k];
      });
      newPlaced[hoveredSlot] = dragging.id;
      setAnimatingTo(hoveredSlot);
      setTimeout(() => setAnimatingTo(null), 400);
      setPlaced(newPlaced);
    }

    setDragging(null);
    setHoveredSlot(null);
  }, [dragging, hoveredSlot, placed]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }
  }, [dragging, handlePointerMove, handlePointerUp]);

  const placedCardIds = new Set(Object.values(placed));
  const unplacedCards = CARDS.filter((c) => !placedCardIds.has(c.id));

  const removeCard = (slotIndex) => {
    const newPlaced = { ...placed };
    delete newPlaced[slotIndex];
    setPlaced(newPlaced);
  };

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: "100vh",
        background: "#F5F2ED",
        fontFamily: "'Georgia', 'Times New Roman', serif",
        userSelect: "none",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes floatIdle {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-6px) rotate(0.5deg); }
          66% { transform: translateY(-3px) rotate(-0.3deg); }
        }
        @keyframes snapIn {
          0% { transform: scale(1.08); opacity: 0.7; }
          50% { transform: scale(0.97); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes slotPulse {
          0%, 100% { box-shadow: inset 0 0 0 2px rgba(0,0,0,0.15); }
          50% { box-shadow: inset 0 0 0 2.5px rgba(0,0,0,0.3); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          padding: "48px 40px 24px",
          animation: "fadeInUp 0.6s ease both",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#9E9689",
            marginBottom: 8,
          }}
        >
          Visual Style Explorer
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 400,
            color: "#3A3530",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Drag cards into the tray
        </h1>
      </div>

      {/* Drop Zone */}
      <div
        style={{
          margin: "16px 40px 32px",
          padding: 20,
          background: "rgba(0,0,0,0.03)",
          borderRadius: 16,
          border: "1px dashed rgba(0,0,0,0.1)",
          animation: "fadeInUp 0.6s ease 0.1s both",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#AEA89F",
            marginBottom: 14,
          }}
        >
          Collection Tray — {Object.keys(placed).length}/{SLOT_COUNT}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
          }}
        >
          {Array.from({ length: SLOT_COUNT }).map((_, i) => {
            const cardId = placed[i];
            const card = CARDS.find((c) => c.id === cardId);
            const isHovered = hoveredSlot === i && dragging;
            const justSnapped = animatingTo === i;

            return (
              <div
                key={i}
                ref={(el) => (slotRefs.current[i] = el)}
                style={{
                  aspectRatio: "3 / 4",
                  borderRadius: 12,
                  background: isHovered ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.02)",
                  border: isHovered
                    ? "2px solid rgba(0,0,0,0.25)"
                    : "1.5px dashed rgba(0,0,0,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  animation: isHovered ? "slotPulse 0.8s ease infinite" : "none",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {card ? (
                  <div
                    onClick={() => removeCard(i)}
                    style={{
                      width: "100%",
                      height: "100%",
                      background: card.color,
                      borderRadius: 11,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      cursor: "pointer",
                      animation: justSnapped
                        ? "snapIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both"
                        : "floatIdle 4s ease-in-out infinite",
                      animationDelay: justSnapped ? "0s" : `${i * 0.7}s`,
                      boxShadow: `
                        0 8px 24px -4px rgba(0,0,0,0.12),
                        0 16px 40px -8px rgba(0,0,0,0.08),
                        0 2px 6px rgba(0,0,0,0.06)
                      `,
                      position: "relative",
                    }}
                  >
                    <div style={{ fontSize: 28, color: card.accent, lineHeight: 1 }}>
                      {card.icon}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: card.accent,
                        letterSpacing: "0.05em",
                      }}
                    >
                      {card.label}
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 10,
                        fontSize: 14,
                        color: card.accent,
                        opacity: 0.4,
                      }}
                    >
                      ×
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 20, color: "rgba(0,0,0,0.1)" }}>+</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Source Cards */}
      <div style={{ padding: "0 40px 48px", animation: "fadeInUp 0.6s ease 0.2s both" }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#AEA89F",
            marginBottom: 14,
          }}
        >
          Available Cards
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {unplacedCards.map((card, idx) => (
            <div
              key={card.id}
              onPointerDown={(e) => handlePointerDown(e, card)}
              style={{
                width: 110,
                height: 146,
                background: card.color,
                borderRadius: 12,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                cursor: "grab",
                animation: `floatIdle 4s ease-in-out infinite`,
                animationDelay: `${idx * 0.5}s`,
                boxShadow: `
                  0 8px 24px -4px rgba(0,0,0,0.12),
                  0 16px 40px -8px rgba(0,0,0,0.08),
                  0 2px 6px rgba(0,0,0,0.06)
                `,
                touchAction: "none",
                opacity: dragging?.id === card.id ? 0.3 : 1,
                transition: "opacity 0.2s ease",
              }}
            >
              <div style={{ fontSize: 28, color: card.accent, lineHeight: 1 }}>
                {card.icon}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: card.accent,
                  letterSpacing: "0.05em",
                }}
              >
                {card.label}
              </div>
            </div>
          ))}
          {unplacedCards.length === 0 && (
            <div style={{ fontSize: 13, color: "#B5AFA6", fontStyle: "italic" }}>
              All cards placed — click a card in the tray to return it
            </div>
          )}
        </div>
      </div>

      {/* Dragging Ghost */}
      {dragging && (
        <div
          style={{
            position: "fixed",
            left: dragPos.x,
            top: dragPos.y,
            width: 110,
            height: 146,
            background: dragging.color,
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            pointerEvents: "none",
            zIndex: 1000,
            boxShadow: `
              0 20px 50px -8px rgba(0,0,0,0.25),
              0 30px 70px -12px rgba(0,0,0,0.15),
              0 4px 12px rgba(0,0,0,0.1)
            `,
            transform: "scale(1.06) rotate(-2deg)",
            transition: "box-shadow 0.2s ease",
          }}
        >
          <div style={{ fontSize: 28, color: dragging.accent, lineHeight: 1 }}>
            {dragging.icon}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: dragging.accent,
              letterSpacing: "0.05em",
            }}
          >
            {dragging.label}
          </div>
        </div>
      )}
    </div>
  );
}