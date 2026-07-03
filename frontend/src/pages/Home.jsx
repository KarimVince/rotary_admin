import { useHealthCheck } from "../hooks/useHealthCheck";

export default function Home() {
  const apiStatus = useHealthCheck();

  return (
    <div>
      <h1>Rotary Admin</h1>
      <p>API status: {apiStatus}</p>
    </div>
  );
}
