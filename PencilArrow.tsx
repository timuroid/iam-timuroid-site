import { useId } from "react";

type PencilArrowProps = {
  width?: number | string;
  color?: string;
  duration?: number;
  className?: string;
};

// React reference supplied for the graphite arrow. The live site uses the
// same SVG paths and filter inline because its frontend has no React runtime.
export default function PencilArrow({
  width = 340,
  color = "#f4f4f4",
  duration = 2.2,
  className,
}: PencilArrowProps) {
  const id = useId().replace(/:/g, "");
  const filterId = `graphite-${id}`;
  return (
    <svg
      className={className}
      width={width}
      viewBox="0 0 340 490"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Карандашная стрелка"
      style={{ display: "block", overflow: "visible", color }}
    >
      <defs>
        <filter id={filterId} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.18" numOctaves={4} seed={17} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={15} xChannelSelector="R" yChannelSelector="G" result="distorted" />
          <feColorMatrix in="noise" type="saturate" values="0" result="gray" />
          <feComponentTransfer in="gray" result="grain"><feFuncA type="linear" slope={3.5} intercept={-1.5} /></feComponentTransfer>
          <feComposite in="distorted" in2="grain" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`} stroke="currentColor" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M270 450 C220 414 128 342 111 277 C92 204 107 145 159 100 C193 71 226 55 262 43"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100}
        >
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur={`${duration * 0.75}s`} fill="freeze" begin="0s" />
        </path>
        <path d="M210 19 L262 43 L239 91" pathLength={100} strokeDasharray={100} strokeDashoffset={100}>
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur={`${duration * 0.25}s`} begin={`${duration * 0.75}s`} fill="freeze" />
        </path>
      </g>
    </svg>
  );
}
