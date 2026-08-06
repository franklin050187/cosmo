export default function Card({ className = "", children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`border border-[#1C598C] rounded-md bg-[#021526]/65 backdrop-blur p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
