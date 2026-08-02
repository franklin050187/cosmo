"use client";

import { forwardRef } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "amber";
  size?: "sm" | "md";
}

const variantStyles = {
  primary:
    "border-[#1C598C] bg-gradient-to-b from-[#1e3851]/25 to-[#124c80]/25 text-cyan-400 hover:bg-cyan-400/20 hover:text-white",
  secondary:
    "border-gray-600 text-gray-400 hover:text-white hover:border-gray-400",
  danger:
    "border-[#8b0000] bg-gradient-to-b from-[#8b0000]/25 to-[#5c0000]/25 text-red-400 hover:bg-red-400/20 hover:text-white",
  amber:
    "border-amber-500/50 text-amber-300 hover:bg-amber-500/20",
};

const sizeStyles = {
  sm: "px-2 py-1 text-xs",
  md: "px-4 py-2",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
