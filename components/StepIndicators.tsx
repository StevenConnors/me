interface StepIndicatorsProps {
  steps: Array<{ media: string; kind: 'image' | 'video' }>;
  active: number;
}

export default function StepIndicators({ steps, active }: StepIndicatorsProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="flex flex-col space-y-6">
        {steps.map((_, index) => (
          <div
            key={index}
            className={`font-mono transition-all duration-500 ease-in-out ${
              index === active 
                ? 'text-black font-bold text-4xl scale-125' 
                : 'text-gray-200 text-2xl scale-100'
            }`}
          >
            —
          </div>
        ))}
      </div>
    </div>
  );
}