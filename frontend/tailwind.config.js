/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        depot: {
          moc: "#3B82F6",   // blue   – Mo Chit
          khu: "#8B5CF6",   // violet – Khukhot
          kha: "#10B981",   // green  – Kheha
        },
      },
      animation: {
        pulse_fast: "pulse 1s cubic-bezier(0.4,0,0.6,1) infinite",
      },
    },
  },
  plugins: [],
};
