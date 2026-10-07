import { useState, useEffect, useRef } from "react";

export function useTypewriter(
  lines: string[],
  speed = 35,
  pauseBetween = 1200
) {
  const [output, setOutput] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pause" | "clear">("typing");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (lines.length === 0) return;

    function tick() {
      if (phase === "typing") {
        const line = lines[currentLine];
        if (currentChar < line.length) {
          setOutput(o => {
            const next = [...o];
            next[currentLine] = line.slice(0, currentChar + 1);
            return next;
          });
          setCurrentChar(c => c + 1);
          timerRef.current = setTimeout(tick, speed);
        } else {
          // Line complete
          if (currentLine < lines.length - 1) {
            setCurrentLine(l => l + 1);
            setCurrentChar(0);
            setOutput(o => [...o, ""]);
            timerRef.current = setTimeout(tick, speed * 3);
          } else {
            setPhase("pause");
            timerRef.current = setTimeout(tick, pauseBetween);
          }
        }
      } else if (phase === "pause") {
        setPhase("clear");
        timerRef.current = setTimeout(tick, 200);
      } else {
        // clear and restart
        setOutput([""]);
        setCurrentLine(0);
        setCurrentChar(0);
        setPhase("typing");
        timerRef.current = setTimeout(tick, 400);
      }
    }

    setOutput([""]);
    setCurrentLine(0);
    setCurrentChar(0);
    setPhase("typing");
    timerRef.current = setTimeout(tick, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.join("|"), speed, pauseBetween]);

  return output;
}
