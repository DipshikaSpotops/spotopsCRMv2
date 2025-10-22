export function validateSignup(req, res, next) {
  const { firstName, lastName, email, password, team, role } = req.body;

  if (!firstName || !lastName || !email || !password || !team || !role) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format." });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  }

  if (!["Shankar", "Vinutha"].includes(team)) {
    return res.status(400).json({ message: "Invalid team selected." });
  }

  if (role !== "Admin") {
    return res.status(403).json({ message: "Only Admins can sign up directly." });
  }

  next();
}
