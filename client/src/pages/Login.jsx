// import React, { useState } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import axios from "axios";

// const Login = () => {
//   const [formData, setFormData] = useState({ email: "", password: "" });
//   const [error, setError] = useState("");
//   const [showPassword, setShowPassword] = useState(false);
//   const navigate = useNavigate();

//   const handleChange = (e) => {
//     setFormData({ ...formData, [e.target.name]: e.target.value });
//   };

// const handleSubmit = async (e) => {
//   e.preventDefault();
//   try {
//     const res = await axios.post("/api/auth/login", formData);
//     if (res.data.token) {
//       localStorage.setItem("token", res.data.token);
//       localStorage.setItem("firstName", res.data.user.firstName);
//       localStorage.setItem("role", res.data.user.role);

//       alert(`Welcome ${res.data.user.firstName}!`);
//       navigate("/dashboard"); 
//     }
//   } catch (err) {
//     setError(err.response?.data?.message || "Login failed");
//   }
// };

//   return (
//     <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-accentPurple to-accentPink text-white">
//       <form
//         className="bg-gray-900 p-8 rounded shadow-md w-full max-w-md"
//         onSubmit={handleSubmit}
//       >
//         <h2 className="text-2xl font-bold mb-6 text-center">Welcome Back</h2>

//         {error && (
//           <p className="text-red-400 mb-4 text-sm text-center">{error}</p>
//         )}

//         <input
//           type="email"
//           name="email"
//           placeholder="Email"
//           onChange={handleChange}
//           className="w-full p-2 mb-4 rounded bg-gray-800 text-white"
//           required
//         />

//         <div className="relative mb-6">
//           <input
//             type={showPassword ? "text" : "password"}
//             name="password"
//             placeholder="Password"
//             onChange={handleChange}
//             className="w-full p-2 pr-10 rounded bg-gray-800 text-white"
//             required
//           />
//           <span
//             onClick={() => setShowPassword(!showPassword)}
//             className="absolute inset-y-0 right-3 flex items-center cursor-pointer text-gray-400 hover:text-white"
//           >
//             {showPassword ? (
//               <svg
//                 xmlns="http://www.w3.org/2000/svg"
//                 fill="none"
//                 viewBox="0 0 24 24"
//                 strokeWidth={1.8}
//                 stroke="currentColor"
//                 className="w-5 h-5"
//               >
//                 <path
//                   strokeLinecap="round"
//                   strokeLinejoin="round"
//                   d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.03-10-9s4.477-9 10-9c1.083 0 2.124.181 3.125.525m2.625 2.375a9.975 9.975 0 012.25 6.1c0 1.243-.232 2.432-.65 3.525M15 12a3 3 0 11-6 0 3 3 0 016 0z"
//                 />
//               </svg>
//             ) : (
//               <svg
//                 xmlns="http://www.w3.org/2000/svg"
//                 fill="none"
//                 viewBox="0 0 24 24"
//                 strokeWidth={1.8}
//                 stroke="currentColor"
//                 className="w-5 h-5"
//               >
//                 <path
//                   strokeLinecap="round"
//                   strokeLinejoin="round"
//                   d="M3.98 8.223a10.008 10.008 0 0116.664 0M21 12c0 2.21-.895 4.209-2.34 5.657m-3.054 2.178a9.99 9.99 0 01-4.615 1.165c-5.523 0-10-4.03-10-9s4.477-9 10-9c1.315 0 2.578.254 3.743.719"
//                 />
//               </svg>
//             )}
//           </span>
//         </div>

//         <button
//           type="submit"
//           className="bg-accentPink w-full py-2 rounded hover:bg-pink-600 transition"
//         >
//           Login
//         </button>

//         <p className="mt-4 text-sm text-center">
//           Don’t have an account?{" "}
//           <Link to="/signup" className="text-accentPurple underline">
//             Sign up
//           </Link>
//         </p>
//       </form>
//     </div>
//   );
// };

// export default Login;

// src/pages/LoginPage.jsx

// /src/pages/LoginPage.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../api"; 
import { persistStoredAuth } from "../utils/authStorage";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post("/auth/login", formData);
      if (res.data.token && res.data.user) {
        const authPayload = {
          user: res.data.user,
          token: res.data.token,
          loginAt: Date.now(),
        };
        persistStoredAuth(authPayload);

        alert(`Welcome ${res.data.user.firstName}!`);
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-accentPurple to-accentPink text-white">
      <form className="bg-gray-900 p-8 rounded shadow-md w-full max-w-md" onSubmit={handleSubmit}>
        <h2 className="text-2xl font-bold mb-6 text-center">Welcome Back</h2>

        {error && <p className="text-red-400 mb-4 text-sm text-center">{error}</p>}

        <input
          type="email"
          name="email"
          placeholder="Email"
          onChange={handleChange}
          className="w-full p-2 mb-4 rounded bg-gray-800 text-white"
          required
        />

        <div className="relative mb-6">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="Password"
            onChange={handleChange}
            className="w-full p-2 pr-10 rounded bg-gray-800 text-white"
            required
          />
          <span
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-3 flex items-center cursor-pointer text-gray-400 hover:text-white"
          >
            {showPassword ? "🙈" : "👁️"}
          </span>
        </div>

        <button type="submit" className="bg-accentPink w-full py-2 rounded hover:bg-pink-600 transition">
          Login
        </button>

        <p className="mt-4 text-sm text-center">
          Don’t have an account?{" "}
          <Link to="/signup" className="text-accentPurple underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
};

export default Login;
