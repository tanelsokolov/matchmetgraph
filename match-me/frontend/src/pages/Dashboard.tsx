import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { PotentialMatches } from "@/components/PotentialMatches";

const Dashboard = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-match-light/10 to-match-dark/10">
      <Header />
      <div className="max-w-4xl mx-auto p-8">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="space-y-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Potential Matches</h2>
              <PotentialMatches />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;