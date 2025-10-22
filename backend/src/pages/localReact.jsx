const [users, setUsers] = useState<User[]>([]);

useEffect(() => {
  async function fetchData() {
    const res = await fetch('/api/users');
    const data = await res.json();
    setUsers(data);
  }
  fetchData();
}, []);
