import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const Signup = () => {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    team: "Shankar",
    role: "Admin"
  });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post("/api/auth/signup", formData);
      alert(res.data.message);
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.message || "Signup failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-accentPurple to-accentPink text-white">
      <form className="bg-[#f6f6f6] p-8 rounded shadow-md w-full max-w-md" onSubmit={handleSubmit}>
        <h2 className="text-2xl font-bold mb-6 text-center text-[#3c3c3c]">Admin Signup</h2>

        {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}

        <input type="text" name="firstName" placeholder="First Name" onChange={handleChange} className="w-full p-2 mb-4 rounded bg-[#1e0e0e] text-black" required />
        <input type="text" name="lastName" placeholder="Last Name" onChange={handleChange} className="w-full p-2 mb-4 rounded bg-[#adadad] text-black" required />
        <input type="email" name="email" placeholder="Email" onChange={handleChange} className="w-full p-2 mb-4 rounded bg-[#adadad] text-black" required />
        <input type="password" name="password" placeholder="Password" onChange={handleChange} className="w-full p-2 mb-4 rounded bg-[#adadad] text-black" required />
        <select name="team" onChange={handleChange} className="w-full p-2 mb-4 rounded bg-[#adadad] text-black">
          <option value="Shankar">Shankar</option>
          <option value="Vinutha">Vinutha</option>
        </select>

        <input type="text" name="role" value="Admin" readOnly className="w-full p-2 mb-4 rounded bg-[#adadad] text-black" />

        <button type="submit" className="bg-accentPink w-full py-2 rounded hover:bg-pink-600">Sign Up</button>
        <p className="mt-4 text-sm text-center">
          Already have an account? <a href="/login" className="text-accentPurple underline">Log in</a>
        </p>
      </form>
    </div>
  );
};

export default Signup;