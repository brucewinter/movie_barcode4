
import React from 'react';

interface BarcodeProps {
  palette: string[];
  height?: string;
  className?: string;
}

export const Barcode: React.FC<BarcodeProps> = ({ palette, height = "h-16", className = "" }) => {
  return (
    <div className={`flex w-full overflow-hidden rounded-md border border-zinc-800 ${height} ${className}`}>
      {palette.map((color, index) => (
        <div
          key={`${color}-${index}`}
          className="flex-1 transition-all duration-500 hover:scale-x-150 hover:z-10"
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  );
};
