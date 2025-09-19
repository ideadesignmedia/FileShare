import React from "react";

type ButtonProps = {
  variant?: "primary" | "secondary" | "danger" | "outline" | "inverted" | "outlineDanger" | "light" | "success";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'submit' | 'reset' | 'button'
  icon?: boolean;
};

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  disabled = false,
  className = "",
  children,
  onClick,
  type,
  icon = false,
}) => {
  // Base button styles
  const baseClasses =
    "rounded-lg shadow focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors transition-shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed active:scale-[.98] cursor-pointer select-none";

  // Variant-specific classes
  const variantClasses: Record<string, string> = {
    primary:
      "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    secondary:
      "bg-slate-600 text-white hover:bg-slate-700 focus:ring-slate-500",
    danger:
      "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
    success:
      "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500",
    outline:
      "border border-slate-300 text-slate-800 hover:bg-slate-100 focus:ring-blue-500",
    outlineDanger:
      "border border-red-600 text-red-600 hover:bg-red-600 hover:text-white focus:ring-red-500",
    // Light button for dark headers
    light:
      "bg-white text-blue-700 hover:bg-blue-50 focus:ring-white",
    // For dark headers: white text and border that inverts on hover
    inverted:
      "border border-white text-white hover:bg-white hover:text-blue-700 focus:ring-white/60",
  };

  // Size-specific classes
  const sizeClasses: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-6 py-3 text-lg",
  };

  const sizing = icon ? "p-0 inline-flex items-center justify-center" : sizeClasses[size];
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizing} ${className}`;

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
};

export default React.memo(Button);
