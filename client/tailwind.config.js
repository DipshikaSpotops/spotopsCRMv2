import tailwindScrollbar from 'tailwind-scrollbar';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', 
  theme: {
    extend: {
      colors: {
        primary: "#0f172a",
        accentPurple: "#7c3aed",
        accentPink: "#ec4899",
        darkBg: "#0b1120", 
        formTeal: '#0f766e',
        formMint: '#14b8a6',
        bodyText: '#e1ebeb',  
        tHead: '#18042b',
        tableBg: '#c40505',
      },
      backgroundImage: {
        'login-gradient': 'linear-gradient(135deg, #3f7edb, #6d3fcc, #c4279c)',
        'login-gradient-dark': 'linear-gradient(to bottom right, #0b1120, #5b21b6, #db2777)',
        'crm-form-gradient': 'linear-gradient(to bottom right, #0f766e, #14b8a6)'
      },
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [
    tailwindScrollbar,
  ],
};
