interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export default function Card({ className = "", children, ...props }: CardProps) {
  return (
    <div
      className={`border border-[#1C598C] rounded-md bg-[#021526]/65 backdrop-blur p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
