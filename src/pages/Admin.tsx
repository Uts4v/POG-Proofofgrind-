import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { db } from "@/integrations/firebase/client";
import { formatTimeShort } from "@/hooks/useWorkSession";
import { toast } from "sonner";
import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  Timestamp,
  updateDoc,
  query,
  orderBy,
  limit,
  where,
} from "firebase/firestore";
import { Profile } from "@/integrations/firebase/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Trash2,
  Users,
  Shield,
  ShieldCheck,
  RefreshCw,
  Calendar,
  DollarSign,
  BarChart3,
  Clock,
  Coffee,
  Target,
  X,
  Eye,
  Download,
  FileText,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface WorkSession {
  id: string;
  userId: string;
  date: string;
  workStartTime?: Timestamp;
  workEndTime?: Timestamp;
  totalWorkDuration: number;
  totalBreakDuration: number;
  status: "idle" | "working" | "break" | "completed";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface UserWithStats extends Profile {
  todayWorkTime: number;
  todayBreakTime: number;
  monthWorkTime: number;
  monthBreakTime: number;
  currentStatus: string;
  isActive: boolean;
  last30DaysWorkTime: number;
  last30DaysBreakTime: number;
  last30DaysSessions: number;
  averageDailyWorkTime: number;
  focusRate: number;
  totalSessionsThisMonth: number;
  averageSessionDuration: number;
  weeklyWorkPattern: { [key: string]: number };
  dailyWorkPattern: Array<{ date: string; workTime: number; breakTime: number }>;
  sessionHistory?: WorkSession[];
  prev30DaysFocusRate?: number;
  prev30DaysWorkHours?: number;
}

interface Subscription {
  id: string;
  name: string;
  renewed_date?: Timestamp;
  deadline_date?: Timestamp;
  renewalDate?: Timestamp;
  cost: number;
  isActive: boolean;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const statusBadgeStyles = {
  working: "bg-emerald-600 hover:bg-emerald-700 text-white",
  break: "bg-amber-600 hover:bg-amber-700 text-white",
  idle: "bg-slate-600 hover:bg-slate-700 text-white",
  completed: "bg-blue-600 hover:bg-blue-700 text-white",
};

function getFocusTextStyle(rate: number): string {
  if (rate >= 80) return "text-emerald-700 dark:text-emerald-400 font-bold";
  if (rate >= 65) return "text-amber-700 dark:text-amber-400 font-semibold";
  return "text-red-700 dark:text-red-400 font-medium";
}

function getFocusBarColor(rate: number): string {
  if (rate >= 80) return "#16a34a";
  if (rate >= 65) return "#d97706";
  return "#dc2626";
}

const Admin = () => {
  const { user, profile, loading: authLoading } = useAuthContext();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analytics modal states (existing)
  const [analyticsUser, setAnalyticsUser] = useState<UserWithStats | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // New: Employee Dashboard modal states
  const [selectedEmployee, setSelectedEmployee] = useState<UserWithStats | null>(null);
  const [employeeAnalyticsOpen, setEmployeeAnalyticsOpen] = useState(false);
  const [loadingEmployeeData, setLoadingEmployeeData] = useState(false);

  const fetchUserSessions = async (userId: string): Promise<WorkSession[]> => {
    try {
      const sessionsRef = collection(db, "users", userId, "sessions");
      const sessionsQuery = query(sessionsRef, orderBy("createdAt", "desc"), limit(50));
      const sessionsSnapshot = await getDocs(sessionsQuery);
      return sessionsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as WorkSession[];
    } catch (err) {
      console.error("Error fetching user sessions:", err);
      return [];
    }
  };

  const fetchPreviousPeriodStats = async (userId: string): Promise<{ focusRate: number; workHours: number }> => {
    try {
      const now = new Date();
      const prevStart = new Date(now);
      prevStart.setDate(prevStart.getDate() - 60);
      const prevEnd = new Date(now);
      prevEnd.setDate(prevEnd.getDate() - 30);

      const sessionsRef = collection(db, "users", userId, "sessions");
      const q = query(
        sessionsRef,
        where("date", ">=", prevStart.toISOString().split("T")[0]),
        where("date", "<=", prevEnd.toISOString().split("T")[0]),
        orderBy("date", "desc")
      );

      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map((doc) => doc.data());

      const totalWork = sessions.reduce((acc, s) => acc + (s.totalWorkDuration || 0), 0);
      const totalTracked = totalWork + sessions.reduce((acc, s) => acc + (s.totalBreakDuration || 0), 0);
      const focusRate = totalTracked > 0 ? (totalWork / totalTracked) * 100 : 0;

      return {
        focusRate,
        workHours: totalWork / 3600,
      };
    } catch (err) {
      console.error("Error fetching previous period:", err);
      return { focusRate: 0, workHours: 0 };
    }
  };

  const fetchUsers = useCallback(async () => {
    if (!user || profile?.role !== "admin") {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      const usersRef = collection(db, "users");
      const usersSnapshot = await getDocs(usersRef);

      if (usersSnapshot.empty) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const usersWithStats = await Promise.all(
        usersSnapshot.docs.map(async (userDoc) => {
          const userData = { id: userDoc.id, ...userDoc.data() } as Profile;

          let todayWorkTime = 0;
          let todayBreakTime = 0;
          let monthWorkTime = 0;
          let monthBreakTime = 0;
          let currentStatus = "idle";
          let isActive = false;
          let last30DaysWorkTime = 0;
          let last30DaysBreakTime = 0;
          let last30DaysSessions = 0;
          let totalSessionsThisMonth = 0;
          const weeklyWorkPattern: { [key: string]: number } = {
            Monday: 0,
            Tuesday: 0,
            Wednesday: 0,
            Thursday: 0,
            Friday: 0,
            Saturday: 0,
            Sunday: 0,
          };
          const dailyWorkPattern: Array<{ date: string; workTime: number; breakTime: number }> = [];

          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

          try {
            const sessionsRef = collection(db, "users", userData.id, "sessions");
            const sessionsSnapshot = await getDocs(sessionsRef);

            const dailyMap = new Map<string, { workTime: number; breakTime: number }>();

            sessionsSnapshot.docs.forEach((sessionDoc) => {
              const session = { id: sessionDoc.id, ...sessionDoc.data() } as WorkSession;

              if (session.date === todayStr) {
                todayWorkTime += session.totalWorkDuration || 0;
                todayBreakTime += session.totalBreakDuration || 0;

                if (session.status === "working" || session.status === "break") {
                  currentStatus = session.status;
                  isActive = true;
                }
              }

              const sessionDate = new Date(session.date);
              if (sessionDate.getMonth() === currentMonth && sessionDate.getFullYear() === currentYear) {
                monthWorkTime += session.totalWorkDuration || 0;
                monthBreakTime += session.totalBreakDuration || 0;
                totalSessionsThisMonth++;
              }

              if (session.date >= thirtyDaysAgoStr) {
                last30DaysWorkTime += session.totalWorkDuration || 0;
                last30DaysBreakTime += session.totalBreakDuration || 0;
                last30DaysSessions++;

                const dayName = sessionDate.toLocaleDateString("en-US", { weekday: "long" });
                weeklyWorkPattern[dayName] += session.totalWorkDuration || 0;

                if (!dailyMap.has(session.date)) {
                  dailyMap.set(session.date, { workTime: 0, breakTime: 0 });
                }
                const daily = dailyMap.get(session.date)!;
                daily.workTime += session.totalWorkDuration || 0;
                daily.breakTime += session.totalBreakDuration || 0;
              }
            });

            Array.from(dailyMap.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .forEach(([date, times]) => {
                dailyWorkPattern.push({
                  date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                  workTime: Math.round(times.workTime / 3600),
                  breakTime: Math.round(times.breakTime / 3600),
                });
              });
          } catch (err) {
            console.error(`Error fetching sessions for user ${userData.id}:`, err);
          }

          const totalTimeLast30Days = last30DaysWorkTime + last30DaysBreakTime;
          const focusRate = totalTimeLast30Days > 0 ? (last30DaysWorkTime / totalTimeLast30Days) * 100 : 0;
          const averageDailyWorkTime = last30DaysSessions > 0 ? last30DaysWorkTime / 30 : 0;
          const averageSessionDuration = totalSessionsThisMonth > 0 ? monthWorkTime / totalSessionsThisMonth : 0;

          return {
            ...userData,
            todayWorkTime,
            todayBreakTime,
            monthWorkTime,
            monthBreakTime,
            currentStatus,
            isActive,
            last30DaysWorkTime,
            last30DaysBreakTime,
            last30DaysSessions,
            averageDailyWorkTime,
            focusRate,
            totalSessionsThisMonth,
            averageSessionDuration,
            weeklyWorkPattern,
            dailyWorkPattern,
          } as UserWithStats;
        })
      );

      setUsers(usersWithStats);

      try {
        const subscriptionsRef = collection(db, "subscriptions");
        const subscriptionsSnapshot = await getDocs(subscriptionsRef);
        const subscriptionsData = subscriptionsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Subscription[];
        setSubscriptions(subscriptionsData);
      } catch (subsError) {
        console.error("Error fetching subscriptions:", subsError);
        setSubscriptions([]);
      }

      setLoading(false);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(`Failed to fetch data: ${err instanceof Error ? err.message : "Unknown error"}`);
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") {
      fetchUsers();
    }
  }, [authLoading, profile, fetchUsers]);

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") {
      const interval = setInterval(() => {
        fetchUsers();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [authLoading, profile, fetchUsers]);

  const openEmployeeDashboard = async (employee: UserWithStats) => {
    setLoadingEmployeeData(true);
    setSelectedEmployee(employee);
    setEmployeeAnalyticsOpen(true);

    const sessions = await fetchUserSessions(employee.id);
    const prevStats = await fetchPreviousPeriodStats(employee.id);

    setSelectedEmployee((prev) =>
      prev
        ? {
            ...prev,
            sessionHistory: sessions,
            prev30DaysFocusRate: prevStats.focusRate,
            prev30DaysWorkHours: prevStats.workHours,
          }
        : null
    );

    setLoadingEmployeeData(false);
  };

  const removeUser = async (userId: string) => {
    try {
      await deleteDoc(doc(db, "users", userId));
      await fetchUsers();
    } catch (error) {
      console.error("Error removing user:", error);
      setError("Failed to remove user");
    }
  };

  const toggleRole = async (userId: string, currentRole: "admin" | "user") => {
    try {
      const newRole = currentRole === "admin" ? "user" : "admin";
      await updateDoc(doc(db, "users", userId), {
        role: newRole,
        updatedAt: Timestamp.now(),
      });
      await fetchUsers();
      toast.success(`Role updated to ${newRole}`);
    } catch (error) {
      console.error("Error updating role:", error);
      setError("Failed to update user role");
    }
  };

  const deleteSubscription = async (subscriptionId: string) => {
    try {
      await deleteDoc(doc(db, "subscriptions", subscriptionId));
      await fetchUsers();
    } catch (error) {
      console.error("Error deleting subscription:", error);
      setError("Failed to delete subscription");
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 0 || !seconds) seconds = 0;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatHours = (seconds: number) => {
    return (seconds / 3600).toFixed(1);
  };

  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return "—";
    return timestamp.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const exportToCSV = () => {
    if (!selectedEmployee?.sessionHistory?.length) return;

    const headers = ["Date", "Status", "Work Time", "Break Time", "Total Time", "Start Time"];
    const rows = selectedEmployee.sessionHistory.map((s) => [
      new Date(s.date).toLocaleDateString(),
      s.status,
      formatTime(s.totalWorkDuration),
      formatTime(s.totalBreakDuration),
      formatTime(s.totalWorkDuration + s.totalBreakDuration),
      s.createdAt?.toDate?.().toLocaleString() || "—",
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${selectedEmployee.fullName || "employee"}_sessions.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    if (!selectedEmployee?.sessionHistory?.length) return;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(`Performance Report: ${selectedEmployee.fullName || "Employee"}`, 20, 20);

    doc.setFontSize(12);
    doc.text(`Focus Rate: ${selectedEmployee.focusRate.toFixed(1)}%`, 20, 35);
    doc.text(`Today's Work: ${formatTime(selectedEmployee.todayWorkTime)}`, 20, 45);

    autoTable(doc, {
      startY: 60,
      head: [["Date", "Status", "Work", "Break", "Total", "Start"]],
      body: selectedEmployee.sessionHistory.map((s) => [
        new Date(s.date).toLocaleDateString(),
        s.status,
        formatTime(s.totalWorkDuration),
        formatTime(s.totalBreakDuration),
        formatTime(s.totalWorkDuration + s.totalBreakDuration),
        s.createdAt?.toDate?.().toLocaleString() || "—",
      ]),
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`${selectedEmployee.fullName || "employee"}_report.pdf`);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-5">
          <RefreshCw className="h-12 w-12 text-indigo-600 animate-spin" />
          <p className="text-xl font-medium text-foreground tracking-wide">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (profile?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-lg w-full border-none shadow-2xl bg-card/90 backdrop-blur-lg rounded-3xl overflow-hidden">
          <CardContent className="p-12 text-center">
            <Shield className="h-20 w-20 mx-auto mb-8 text-indigo-500 opacity-80" />
            <h2 className="text-3xl font-bold text-foreground mb-4">Access Denied</h2>
            <p className="text-xl text-muted-foreground">
              You do not have permission to view this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const weeklyData = [
    { day: "Mon", ...Object.fromEntries(users.map((u) => [u.fullName || "Unknown", Math.round((u.weeklyWorkPattern["Monday"] || 0) / 3600)])) },
    { day: "Tue", ...Object.fromEntries(users.map((u) => [u.fullName || "Unknown", Math.round((u.weeklyWorkPattern["Tuesday"] || 0) / 3600)])) },
    { day: "Wed", ...Object.fromEntries(users.map((u) => [u.fullName || "Unknown", Math.round((u.weeklyWorkPattern["Wednesday"] || 0) / 3600)])) },
    { day: "Thu", ...Object.fromEntries(users.map((u) => [u.fullName || "Unknown", Math.round((u.weeklyWorkPattern["Thursday"] || 0) / 3600)])) },
    { day: "Fri", ...Object.fromEntries(users.map((u) => [u.fullName || "Unknown", Math.round((u.weeklyWorkPattern["Friday"] || 0) / 3600)])) },
    { day: "Sat", ...Object.fromEntries(users.map((u) => [u.fullName || "Unknown", Math.round((u.weeklyWorkPattern["Saturday"] || 0) / 3600)])) },
    { day: "Sun", ...Object.fromEntries(users.map((u) => [u.fullName || "Unknown", Math.round((u.weeklyWorkPattern["Sunday"] || 0) / 3600)])) },
  ];

  const performanceData = users.map((u) => ({
    name: u.fullName || "Unknown",
    "Work Hours": parseFloat(formatHours(u.monthWorkTime)),
    "Break Hours": parseFloat(formatHours(u.monthBreakTime)),
    "Focus Rate": u.focusRate,
  }));

  const statusData = [
    { name: "Working", value: users.filter((u) => u.currentStatus === "working").length },
    { name: "On Break", value: users.filter((u) => u.currentStatus === "break").length },
    { name: "Offline", value: users.filter((u) => u.currentStatus === "idle").length },
  ].filter((d) => d.value > 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 max-w-7xl">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12 rounded-2xl p-8 shadow-2xl bg-gradient-to-br from-indigo-600 to-purple-700 dark:from-gray-900 dark:to-gray-800">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">Admin Dashboard</h1>
            <p className="mt-3 text-xl text-gray-100 dark:text-gray-300">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>

          <Button
            onClick={fetchUsers}
            size="sm"
            variant="outline"
            disabled={loading}
            className="border-white text-white hover:bg-white hover:text-black dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <RefreshCw className={`mr-2 h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </header>

        {error && (
          <div className="mb-10 p-6 bg-red-50/80 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl shadow-sm text-red-800 dark:text-red-200 backdrop-blur-sm">
            <p className="font-semibold text-lg">Error loading data</p>
            <p className="mt-2">{error}</p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {[
            { title: "Total Users", value: users.length, sub: `${users.filter((u) => u.isActive).length} active now`, icon: Users, accent: "indigo" },
            {
              title: "Avg Work Today",
              value: formatTime(users.reduce((acc, u) => acc + u.todayWorkTime, 0) / (users.length || 1)),
              sub: "per employee",
              icon: Clock,
              accent: "emerald",
            },
            {
              title: "Avg Focus Rate",
              value: `${(users.reduce((acc, u) => acc + u.focusRate, 0) / (users.length || 1)).toFixed(1)}%`,
              sub: "last 30 days",
              icon: Target,
              accent: "violet",
            },
            {
              title: "Monthly Revenue",
              value: `$${subscriptions.filter((s) => s.isActive).reduce((acc, s) => acc + s.cost, 0).toFixed(2)}`,
              sub: `${subscriptions.filter((s) => s.isActive).length} active`,
              icon: DollarSign,
              accent: "pink",
            },
          ].map((item, idx) => (
            <Card
              key={idx}
              className={`group border-none shadow-lg bg-card/85 backdrop-blur-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 rounded-2xl overflow-hidden border-t-4 border-t-${item.accent}-500`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-base font-medium text-muted-foreground">{item.title}</p>
                  <div className={`p-3 rounded-xl bg-${item.accent}-100/70 dark:bg-${item.accent}-900/30`}>
                    <item.icon className={`h-7 w-7 text-${item.accent}-600 dark:text-${item.accent}-400`} />
                  </div>
                </div>
                <p className="text-4xl font-extrabold text-foreground">{item.value}</p>
                <p className="mt-3 text-sm text-muted-foreground">{item.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Team Members Table */}
        <Card className="border-none shadow-2xl bg-card/85 backdrop-blur-md rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/50 dark:to-purple-950/50 pb-6">
            <CardTitle className="text-2xl font-semibold text-foreground">Team Members</CardTitle>
            <CardDescription className="text-muted-foreground">
              {users.length} employees • real-time overview & management
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b">
                    <TableHead className="w-80 pl-6 py-4 text-muted-foreground font-semibold">User</TableHead>
                    <TableHead className="w-36 py-4 text-muted-foreground font-semibold">Status</TableHead>
                    <TableHead className="text-right py-4 text-muted-foreground font-semibold">Today's Work</TableHead>
                    <TableHead className="text-right py-4 text-muted-foreground font-semibold">Today's Break</TableHead>
                    <TableHead className="text-right py-4 text-muted-foreground font-semibold">This Month Work</TableHead>
                    <TableHead className="text-right py-4 text-muted-foreground font-semibold">This Month Break</TableHead>
                    <TableHead className="text-center py-4 text-muted-foreground font-semibold">Focus Rate</TableHead>
                    <TableHead className="w-32 py-4 text-muted-foreground font-semibold">Role</TableHead>
                    <TableHead className="text-right pr-6 py-4 text-muted-foreground font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-64 text-center py-12">
                        <div className="flex flex-col items-center gap-4 text-muted-foreground">
                          <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
                          <span className="text-lg">Loading team data...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : users.length > 0 ? (
                    users.map((userData) => (
                      <TableRow
                        key={userData.id}
                        className="hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors border-b last:border-none"
                      >
                        <TableCell className="pl-6 py-4">
                          <div className="font-semibold text-foreground">{userData.fullName || "—"}</div>
                          <div className="text-sm text-muted-foreground truncate max-w-xs">{userData.email}</div>
                        </TableCell>
                        <TableCell className="py-4">
                          {userData.currentStatus === "working" && <Badge className={statusBadgeStyles.working}>Working</Badge>}
                          {userData.currentStatus === "break" && <Badge className={statusBadgeStyles.break}>On Break</Badge>}
                          {userData.currentStatus === "idle" && <Badge className={statusBadgeStyles.idle}>Offline</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-medium py-4">{formatTime(userData.todayWorkTime)}</TableCell>
                        <TableCell className="text-right text-muted-foreground py-4">{formatTime(userData.todayBreakTime)}</TableCell>
                        <TableCell className="text-right font-medium py-4">{formatTime(userData.monthWorkTime)}</TableCell>
                        <TableCell className="text-right text-muted-foreground py-4">{formatTime(userData.monthBreakTime)}</TableCell>
                        <TableCell className="text-center py-4">
                          <span className={`text-lg ${getFocusTextStyle(userData.focusRate)}`}>{userData.focusRate.toFixed(1)}%</span>
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge variant={userData.role === "admin" ? "default" : "outline"} className="text-sm px-3 py-1">
                            {userData.role === "admin" ? "Admin" : "User"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-6 py-4">
                          <div className="flex gap-3 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-blue-100/50 dark:hover:bg-blue-900/30 rounded-full"
                              onClick={() => openEmployeeDashboard(userData)}
                              title="View Performance Dashboard"
                            >
                              <Eye className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </Button>
                  
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 rounded-full"
                              onClick={() => toggleRole(userData.id, userData.role || "user")}
                            >
                              {userData.role === "admin" ? (
                                <ShieldCheck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                              ) : (
                                <Shield className="h-5 w-5 text-muted-foreground" />
                              )}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="hover:bg-red-100/50 dark:hover:bg-red-900/30 rounded-full text-red-600 dark:text-red-400 hover:text-red-700"
                                >
                                  <Trash2 className="h-5 w-5" /> 
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-2xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-xl">Delete User?</AlertDialogTitle>
                                  <AlertDialogDescription className="text-muted-foreground">
                                    This will permanently delete <span className="font-medium">{userData.fullName || userData.email}</span> and all associated data. This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => removeUser(userData.id)}
                                    className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
                                  >
                                    Delete User
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="h-64 text-center py-12 text-muted-foreground">
                        No users found in the system.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
.
        {/* Charts Grid */}
        <div className="grid gap-8 lg:grid-cols-2 mb-12">

          {/* Weekly Work Hours */}
          <Card className="lg:col-span-2 border-none shadow-2xl bg-card/85 backdrop-blur-md rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-950/50 dark:to-purple-950/50 pb-6">
              <CardTitle className="text-2xl font-semibold text-foreground">Weekly Work Hours by Employee</CardTitle>
              <CardDescription className="text-muted-foreground mt-1">Distribution across the week (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        borderRadius: "12px",
                        border: "1px solid hsl(var(--border))",
                        boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: "16px" }} />
                    {users.map((user, index) => (
                      <Bar
                        key={user.id}
                        dataKey={user.fullName || "Unknown"}
                        fill={COLORS[index % COLORS.length]}
                        radius={[8, 8, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Performance Overview */}
          <Card className="border-none shadow-2xl bg-card/85 backdrop-blur-md rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/50 dark:to-teal-950/50 pb-6">
              <CardTitle className="text-xl font-semibold text-foreground">Monthly Performance Overview</CardTitle>
              <CardDescription className="text-muted-foreground">Work vs Break hours this month</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[360px]">
                <ResponsiveContainer>
                  <BarChart data={performanceData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="name" type="category" width={160} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        borderRadius: "12px",
                        border: "1px solid hsl(var(--border))",
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Work Hours" fill="#16a34a" radius={6} />
                    <Bar dataKey="Break Hours" fill="#d97706" radius={6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Current Employee Status */}
          <Card className="border-none shadow-2xl bg-card/85 backdrop-blur-md rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-950/50 dark:to-indigo-950/50 pb-6">
              <CardTitle className="text-xl font-semibold text-foreground">Current Employee Status</CardTitle>
              <CardDescription className="text-muted-foreground">Real-time distribution</CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex items-center justify-center h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name === "Working"
                            ? "#16a34a"
                            : entry.name === "On Break"
                            ? "#d97706"
                            : "#64748b"
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
  cursor={{ fill: 'rgba(0, 0, 0, 0.1)' }} // subtle hover highlight
  contentStyle={{
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
    color: 'hsl(var(--popover-foreground))', // ← Ensures text uses theme foreground (light in light mode, near-white in dark)
    padding: '12px 16px',
    fontSize: '14px',
    fontFamily: 'inherit',
  }}
  formatter={(value, name) => [`${name}: ${value}`, '']} // cleaner display
  labelStyle={{
    color: 'hsl(var(--foreground))',
    fontWeight: '600',
    marginBottom: '8px',
  }}
  itemStyle={{
    color: 'hsl(var(--foreground))',
  }}
/>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Focus Rate Comparison */}
          <Card className="lg:col-span-2 border-none shadow-2xl bg-card/85 backdrop-blur-md rounded-2xl overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-violet-50/80 to-purple-50/80 dark:from-violet-950/50 dark:to-purple-950/50 pb-6">
              <CardTitle className="text-2xl font-semibold text-foreground">Focus Rate Comparison</CardTitle>
              <CardDescription className="text-muted-foreground">Employee performance over last 30 days</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[420px]">
                <ResponsiveContainer>
                  <BarChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} stroke="hsl(var(--muted-foreground))" interval={0} />
                    <YAxis label={{ value: "Focus Rate (%)", angle: -90, position: "insideLeft" }} stroke="hsl(var(--muted-foreground))" />
                   <Tooltip
  cursor={{ fill: 'rgba(0, 0, 0, 0.08)' }} // subtle hover highlight
  contentStyle={{
    backgroundColor: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
    color: 'hsl(var(--popover-foreground))', // ← forces readable text color from your theme
    padding: '12px 16px',
    fontSize: '14px',
    fontFamily: 'inherit',
  }}
  labelStyle={{
    color: 'hsl(var(--foreground))',
    fontWeight: '600',
    marginBottom: '8px',
    fontSize: '15px',
  }}
  itemStyle={{
    color: 'hsl(var(--foreground))', // ensures bar value text is visible
  }}
/>
                    <Bar dataKey="Focus Rate" radius={[8, 8, 0, 0]}>
                      {performanceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getFocusBarColor(entry["Focus Rate"])} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        

        {/* Employee Performance Dashboard Modal */}
        <Dialog open={employeeAnalyticsOpen} onOpenChange={setEmployeeAnalyticsOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-card/95 backdrop-blur-xl border-none shadow-2xl rounded-3xl p-8 lg:p-10">
            <DialogHeader className="pb-8 border-b">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-2xl font-bold text-foreground flex items-center gap-4">
                  <BarChart3 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                  Performance Dashboard: {selectedEmployee?.fullName || "Employee"}
                </DialogTitle>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToCSV}
                    disabled={!selectedEmployee?.sessionHistory?.length || loadingEmployeeData}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToPDF}
                    disabled={!selectedEmployee?.sessionHistory?.length || loadingEmployeeData}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEmployeeAnalyticsOpen(false)}>
                    <X className="h-6 w-6" />
                  </Button>
                </div>
              </div>
            </DialogHeader>

            {loadingEmployeeData ? (
              <div className="flex flex-col items-center justify-center py-20">
                <RefreshCw className="h-12 w-12 animate-spin text-emerald-600 mb-4" />
                <p className="text-lg text-muted-foreground">Loading detailed performance data...</p>
              </div>
            ) : selectedEmployee ? (
              <Tabs defaultValue="overview" className="mt-8">
                <TabsList className="grid w-full grid-cols-3 mb-8">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="history">Session History</TabsTrigger>
                  <TabsTrigger value="goals">Goals</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-10">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="tea-card p-5 text-center">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-3 mx-auto bg-primary/10 text-primary">
                        <Clock className="w-5 h-5" />
                      </div>
                      <p className="text-sm text-muted-foreground">Today's Work</p>
                      <p className="text-2xl font-semibold mt-1">{formatTimeShort(selectedEmployee.todayWorkTime)}</p>
                    </div>

                    <div className="tea-card p-5 text-center">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-3 mx-auto bg-accent/10 text-accent">
                        <Coffee className="w-5 h-5" />
                      </div>
                      <p className="text-sm text-muted-foreground">Today's Break</p>
                      <p className="text-2xl font-semibold mt-1">{formatTimeShort(selectedEmployee.todayBreakTime)}</p>
                    </div>

                    <div className="tea-card p-5 text-center">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-3 mx-auto bg-primary/10 text-primary">
                        <Target className="w-5 h-5" />
                      </div>
                      <p className="text-sm text-muted-foreground">Focus Rate</p>
                      <p className="text-2xl font-semibold mt-1">
                        {selectedEmployee.focusRate.toFixed(1)}%
                        {selectedEmployee.prev30DaysFocusRate !== undefined && (
                          <span
                            className={`ml-2 text-xs ${
                              selectedEmployee.focusRate > selectedEmployee.prev30DaysFocusRate
                                ? "text-green-500"
                                : "text-red-500"
                            }`}
                          >
                            {selectedEmployee.focusRate > selectedEmployee.prev30DaysFocusRate ? "↑" : "↓"}
                            {Math.abs(selectedEmployee.focusRate - selectedEmployee.prev30DaysFocusRate).toFixed(1)}%
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="tea-card p-5 text-center">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-3 mx-auto bg-accent/10 text-accent">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <p className="text-sm text-muted-foreground">Sessions (Month)</p>
                      <p className="text-2xl font-semibold mt-1">{selectedEmployee.totalSessionsThisMonth}</p>
                    </div>
                  </div>

                  {/* Visual Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col items-center p-6 bg-muted/30 rounded-xl border border-border/50">
                      <div className="relative w-48 h-48">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
                          <motion.circle
                            cx="50"
                            cy="50"
                            r="44"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            strokeDasharray={276}
                            initial={{ strokeDashoffset: 276 }}
                            animate={{ strokeDashoffset: 276 - (276 * selectedEmployee.focusRate) / 100 }}
                            transition={{ duration: 1.5, ease: "easeOut" }}
                            className="text-primary"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-5xl font-bold">{selectedEmployee.focusRate.toFixed(0)}%</span>
                          <span className="text-sm text-muted-foreground mt-2">Focus Rate</span>
                        </div>
                      </div>
                      <p className="mt-6 text-sm text-center text-muted-foreground">Last 30 days focused time</p>
                    </div>

                    <div className="flex flex-col justify-center p-6 bg-muted/30 rounded-xl border border-border/50 space-y-6">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium">Focused Work</span>
                          <span>{formatTimeShort(selectedEmployee.monthWorkTime)}</span>
                        </div>
                        <div className="h-4 bg-primary/20 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${selectedEmployee.focusRate}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="font-medium">Breaks</span>
                          <span>{formatTimeShort(selectedEmployee.monthBreakTime)}</span>
                        </div>
                        <div className="h-4 bg-accent/20 rounded-full overflow-hidden">
                          <div className="h-full bg-accent rounded-full" style={{ width: `${100 - selectedEmployee.focusRate}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Insight */}
                  <div className="text-center md:text-left text-base font-medium bg-muted/20 p-6 rounded-xl border border-border/50">
                    {selectedEmployee.focusRate >= 80 ? (
                      <>Outstanding performer — top-tier focus and consistency! Keep leading by example. 🍃</>
                    ) : selectedEmployee.focusRate >= 65 ? (
                      <>Strong performer — solid focus rate with room to optimize breaks.</>
                    ) : (
                      <>Room for growth — focus on shorter, intentional breaks to boost productivity.</>
                    )}
                  </div>

                  {/* Daily Pattern */}
                  {selectedEmployee.dailyWorkPattern.length > 0 && (
                    <Card className="border-none shadow-lg">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-xl">Daily Work & Break Pattern</CardTitle>
                        <CardDescription>Last 30 days</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0 pt-4">
                        <div className="h-[340px]">
                          <ResponsiveContainer>
                            <AreaChart data={selectedEmployee.dailyWorkPattern}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                              <YAxis stroke="hsl(var(--muted-foreground))" label={{ value: "Hours", angle: -90, position: "insideLeft" }} />
                              <Tooltip
                                contentStyle={{
                                  background: "hsl(var(--popover))",
                                  borderRadius: "12px",
                                  border: "1px solid hsl(var(--border))",
                                  color: "hsl(var(--popover-foreground))",
                                }}
                              />
                              <Legend />
                              <Area type="monotone" dataKey="workTime" stackId="1" stroke="#16a34a" fill="#16a34a30" name="Work" />
                              <Area type="monotone" dataKey="breakTime" stackId="1" stroke="#d97706" fill="#d9770630" name="Break" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="history">
                  <Card className="border-none shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-xl">Recent Sessions (Last 50)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="pl-6">Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Work</TableHead>
                              <TableHead className="text-right">Break</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-right pr-6">Start</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedEmployee.sessionHistory?.length ? (
                              selectedEmployee.sessionHistory.map((s) => (
                                <TableRow key={s.id}>
                                  <TableCell className="pl-6">{new Date(s.date).toLocaleDateString()}</TableCell>
                                  <TableCell>
                                    <Badge className={statusBadgeStyles[s.status]}>{s.status}</Badge>
                                  </TableCell>
                                  <TableCell className="text-right">{formatTime(s.totalWorkDuration)}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">{formatTime(s.totalBreakDuration)}</TableCell>
                                  <TableCell className="text-right font-semibold">{formatTime(s.totalWorkDuration + s.totalBreakDuration)}</TableCell>
                                  <TableCell className="text-right pr-6 text-sm text-muted-foreground">
                                    {s.createdAt?.toDate?.().toLocaleString() || "—"}
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                  No recent sessions found
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="goals">
                  <div className="text-center py-12 text-muted-foreground">
                    <Target className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-xl font-medium mb-2">Goals Tracking</h3>
                    <p className="max-w-md mx-auto">
                      Coming soon — set daily/weekly focus targets, track progress, and receive personalized recommendations.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Subscription Management */}
        <section className="mt-16">
          <div className="flex items-center gap-4 mb-8">
            <div className="rounded-2xl bg-violet-100 dark:bg-violet-900/30 p-4">
              <Calendar className="h-8 w-8 text-violet-600 dark:text-violet-400" />
            </div>
            <h2 className="text-3xl font-bold text-foreground">Subscription Management</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {subscriptions.length === 0 ? (
              <Card className="col-span-full border-none shadow-lg bg-card/80 backdrop-blur-md rounded-2xl p-12 text-center">
                <p className="text-xl text-muted-foreground">No subscriptions found</p>
              </Card>
            ) : (
              subscriptions.map((subscription) => {
                const now = new Date();
                const deadlineDate = subscription.deadline_date || subscription.renewalDate;
                const deadlineDateObj = deadlineDate?.toDate?.();
                const daysLeft = deadlineDateObj
                  ? Math.ceil((deadlineDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  : 0;

                return (
                  <Card
                    key={subscription.id}
                    className={`border-none shadow-lg bg-card/85 backdrop-blur-md hover:shadow-2xl transition-all duration-300 rounded-2xl overflow-hidden ${
                      daysLeft <= 5 && daysLeft >= 0 ? "ring-2 ring-red-400/50" : ""
                    }`}
                  >
                    <CardHeader className="bg-gradient-to-r from-violet-50/80 to-purple-50/80 dark:from-violet-950/50 dark:to-purple-950/50 pb-6">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl font-semibold text-foreground">{subscription.name}</CardTitle>
                        <Badge variant={subscription.isActive ? "default" : "secondary"} className="px-4 py-1 text-sm">
                          {subscription.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Renewed</span>
                          <span className="text-foreground">
                            {subscription.renewed_date ? subscription.renewed_date.toDate().toLocaleDateString() : "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Deadline</span>
                          <span className="text-foreground">{deadlineDateObj?.toLocaleDateString() || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cost</span>
                          <span className="font-medium text-foreground">${subscription.cost}/mo</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-border">
                          <span className="text-muted-foreground font-medium">Days Left</span>
                          <span
                            className={`font-semibold ${
                              daysLeft <= 5 && daysLeft >= 0
                                ? "text-red-700 dark:text-red-400"
                                : daysLeft <= 10
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {daysLeft > 0 ? `${daysLeft} days` : "Expired"}
                          </span>
                        </div>

                        <div className="pt-4 flex justify-end">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-2xl max-w-md">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-xl">Delete Subscription?</AlertDialogTitle>
                                <AlertDialogDescription className="text-muted-foreground">
                                  This will permanently remove <span className="font-medium">{subscription.name}</span>.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteSubscription(subscription.id)}
                                  className="bg-red-600 hover:bg-red-700 rounded-xl"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Admin;