"use client";

import { useState } from "react";

type Props = { beforeUrl: string; afterUrl: string; productName: string };

/**
 * The before/after slider: the result sits on top of the original photo and is revealed from the left
 * as the slider moves. A native range input, so it works with a mouse, touch, and the keyboard (arrow keys).
 */
export default function BeforeAfter({ beforeUrl, afterUrl, productName }: Props) {
  const [percent, setPercent] = useState(50);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full max-w-md overflow-hidden rounded-lg">
        {/* Users' own photos: loaded straight from Cloudinary, never through Next's image cache (task 46). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={beforeUrl} alt="Before: the original photo" className="block w-full" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterUrl}
          alt={`After: wearing ${productName}`}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - percent}% 0 0)` }}
        />
      </div>
      <label className="flex max-w-md flex-col gap-1 text-sm">
        Compare before and after
        <input
          type="range"
          min={0}
          max={100}
          value={percent}
          onChange={(event) => setPercent(Number(event.target.value))}
          aria-valuetext={`${percent}% after`}
        />
      </label>
    </div>
  );
}
