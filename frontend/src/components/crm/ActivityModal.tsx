import React, { useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import {
  Calendar,
  CheckSquare,
  Mail,
  Phone,
  FileText,
  CalendarClock,
  User,
  Building2,
  ClipboardList,
  Info,
  AlertTriangle,
  Users,
  Briefcase,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { Activity, Account, Deal } from "@/types/crm";
import {
  createActivity,
  updateActivity,
  getAccounts,
  getDeals,
  getContacts,
} from "@/services/crmService";
import { fetchAPI } from "@/services/apiConfig";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  activity?: Activity;
  initialType?: "NOTE" | "CALL" | "EMAIL" | "MEETING" | "TASK";
  preselectedContact?: {
    id: string;
    name: string;
    email?: string;
    companyId?: string;
    isCompany?: boolean;
  };
}

interface User {
  id: string;
  name: string;
  email: string;
}

export const ActivityModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  activity,
  initialType = "NOTE",
  preselectedContact,
}) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<Activity>>({
    type: initialType,
    subject: "",
    description: "",
    status: "PENDING",
    dueDate: "",
    accountId: "",
    dealId: "",
    contactId: "",
    assignedToId: "",
    participantIds: [] as string[],
  });
  const [markAsCompleted, setMarkAsCompleted] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [contacts, setContacts] = useState<
    Array<{ id: string; name: string; email?: string }>
  >([]);
  const [isClientMode, setIsClientMode] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsData, dealsData, contactsData, usersData] =
          await Promise.all([
            getAccounts(),
            getDeals(),
            getContacts(),
            fetchAPI<{ data: { users: User[] } }>("/users"),
          ]);
        setAccounts(accountsData.accounts || []);
        setDeals(dealsData.deals || []);
        setContacts(contactsData.contacts || []);

        const realUsers = (usersData.data?.users || []).filter((user: User) => {
          const email = user.email?.toLowerCase() || "";
          const name = user.name?.toLowerCase() || "";

          return (
            !email.includes("whatsapp.user") &&
            !email.includes("@bot") &&
            !name.includes("whatsapp") &&
            !name.includes("master") &&
            !name.includes("experto en retiro")
          );
        });

        setUsers(realUsers);

        if (!activity) {
          try {
            const token = localStorage.getItem("token");
            if (token) {
              const decoded = jwtDecode<{ id?: string; userId?: string }>(
                token,
              );
              setFormData((prev) => ({ ...prev, assignedToId: decoded.id }));
            }
          } catch (e) {
            console.error("Error decoding token:", e);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();

    if (activity) {
      let dueDateValue = "";
      if (activity.dueDate) {
        const date = new Date(activity.dueDate);
        const pad = (num: number) => num.toString().padStart(2, "0");
        dueDateValue = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
      }

      setFormData({
        type: activity.type,
        subject: activity.subject,
        description: activity.description || "",
        status: activity.status,
        dueDate: dueDateValue,
        accountId: activity.accountId || "",
        dealId: activity.dealId || "",
        contactId: activity.contactId || "",
        assignedToId: activity.assignedToId || "",
      });
      setIsClientMode(
        !!(activity.accountId || activity.dealId || activity.contactId),
      );
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);

      const pad = (num: number) => num.toString().padStart(2, "0");
      const tomorrowValue = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;

      setFormData({
        type: initialType,
        subject: "",
        description: "",
        status: "PENDING",
        dueDate: tomorrowValue,
        accountId: preselectedContact?.companyId || "",
        dealId: "",
        contactId: preselectedContact?.id || "",
        assignedToId: "",
        participantIds: [],
      });
      setIsClientMode(!!preselectedContact);
    }
  }, [activity, preselectedContact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : undefined,
        accountId: formData.accountId || undefined,
        dealId: formData.dealId || undefined,
        contactId: formData.contactId || undefined,
        assignedToId: formData.assignedToId || undefined,
        status: (markAsCompleted ? "COMPLETED" : "PENDING") as
          | "PENDING"
          | "COMPLETED",
      };

      if (activity) {
        await updateActivity(activity.id, payload);
      } else {
        await createActivity(payload);
      }
      onSave();
    } catch (error) {
      console.error("Error saving activity:", error);
    } finally {
      setLoading(false);
    }
  };

  const isMeeting = formData.type === "MEETING";

  // Activity type icons
  const typeIcons: Record<string, React.ReactNode> = {
    NOTE: <FileText className="w-4 h-4" />,
    CALL: <Phone className="w-4 h-4" />,
    EMAIL: <Mail className="w-4 h-4" />,
    MEETING: <Calendar className="w-4 h-4" />,
    TASK: <CheckSquare className="w-4 h-4" />,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={activity ? t("crm.activities.edit_title") : t("crm.activities.new_title")}
      subtitle={isMeeting ? t("crm.activities.meeting_sync") : t("crm.activities.new_desc")}
      icon={<ClipboardList size={22} className="text-orange-600 dark:text-orange-400" />}
      size="lg"
      busy={loading}
      footer={
        <>
          <ModalButton variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </ModalButton>
          <ModalButton variant="primary" type="submit" form="activity-form" loading={loading}>
            {activity ? t("common.save") : t("crm.activities.new_title")}
          </ModalButton>
        </>
      }
    >
        {/* Form */}
        <form
          id="activity-form"
          onSubmit={handleSubmit}
          className="space-y-5"
        >
          {/* Locked Contact Card */}
          {preselectedContact ? (
            <div className="p-4 bg-reply-bg dark:bg-white/5 border border-gray-200 dark:border-reply-border-dark rounded-xl">
              <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                {preselectedContact.isCompany ? (
                  <Building2 className="w-3.5 h-3.5" />
                ) : (
                  <User className="w-3.5 h-3.5" />
                )}
                {t("crm.accounts.fields.related_to")}{" "}
                {preselectedContact.isCompany ? t("navigation.accounts") : t("navigation.contacts")}
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold">
                  {preselectedContact.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">
                    {preselectedContact.name}
                  </h4>
                  {preselectedContact.email && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {preselectedContact.email}
                    </p>
                  )}
                </div>
              </div>
              {!preselectedContact.email && isMeeting && (
                <div className="mt-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-2.5 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>{t("crm.activities.no_email_warning")}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex p-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setIsClientMode(false);
                  setFormData({
                    ...formData,
                    accountId: "",
                    dealId: "",
                    contactId: "",
                  });
                }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  !isClientMode
                    ? "bg-white dark:bg-gray-600 text-orange-600 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                <User className="w-4 h-4" />
                {t("crm.activities.organizer")} / {t("tenants.metrics.support_queues")}
              </button>
              <button
                type="button"
                onClick={() => setIsClientMode(true)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  isClientMode
                    ? "bg-white dark:bg-gray-600 text-orange-600 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                <Building2 className="w-4 h-4" />
                {t("crm.activities.company")} / {t("crm.activities.deal")}
              </button>
            </div>
          )}

          {/* Type of Activity - Enterprise Selector */}
          <div>
            <label className="block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 ml-1">
              {t("crm.activities.type_label")}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {(["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] as const).map((type) => {
                const isSelected = formData.type === type;
                const config = {
                  NOTE: { label: t("crm.activities.types.note"), icon: <FileText size={18} />, color: "blue" },
                  CALL: { label: t("crm.activities.types.call"), icon: <Phone size={18} />, color: "emerald" },
                  EMAIL: { label: t("crm.activities.types.email"), icon: <Mail size={18} />, color: "purple" },
                  MEETING: { label: t("crm.activities.types.meeting"), icon: <Calendar size={18} />, color: "indigo" },
                  TASK: { label: t("crm.activities.types.task"), icon: <CheckSquare size={18} />, color: "amber" },
                }[type];

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, type })}
                    className={`flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border-2 transition-all duration-300 ${
                      isSelected
                        ? `bg-${config.color}-500/10 border-${config.color}-500 text-${config.color}-600 dark:text-${config.color}-400 ring-4 ring-${config.color}-500/10`
                        : "border-gray-100 dark:border-reply-border-dark hover:border-gray-300 dark:hover:border-gray-500 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <div className={`p-2 rounded-xl ${isSelected ? `bg-${config.color}-500 text-white shadow-lg` : "bg-gray-100 dark:bg-reply-surface-dark text-gray-400"} transition-all`}>
                      {config.icon}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider">{config.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
              {t("crm.activities.subject")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.subject}
              onChange={(e) =>
                setFormData({ ...formData, subject: e.target.value })
              }
              className="w-full px-4 py-3 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-400 transition-all"
              placeholder={
                isMeeting
                  ? t("crm.activities.meeting_date")
                  : t("crm.activities.subject_placeholder")
              }
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
              {t("crm.activities.description")}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent placeholder-gray-400 transition-all resize-none"
              rows={3}
              placeholder={t("crm.activities.description_placeholder")}
            />
          </div>

          {/* Date & Time with Icon */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              {isMeeting
                ? t("crm.activities.meeting_date")
                : t("crm.activities.due_date")}
            </label>
            <input
              type="datetime-local"
              value={formData.dueDate}
              onChange={(e) =>
                setFormData({ ...formData, dueDate: e.target.value })
              }
              className="w-full px-4 py-3 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
            />
            {isMeeting && formData.dueDate && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Info className="w-4 h-4" />
                {t("crm.activities.sync_notice")}
              </p>
            )}
          </div>

          {/* Assigned To & Participants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                <User className="w-4 h-4" />
                {isMeeting ? t("crm.activities.organizer") : t("crm.activities.responsible")}
              </label>
              <select
                value={formData.assignedToId}
                onChange={(e) =>
                  setFormData({ ...formData, assignedToId: e.target.value })
                }
                disabled={!activity}
                className={`w-full px-4 py-2.5 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent font-medium transition-all ${!activity ? "opacity-70 cursor-not-allowed bg-gray-100 dark:bg-gray-900" : ""}`}
              >
                <option value="">{t("crm.activities.unassigned")}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            {isMeeting && (
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {t("crm.activities.guests")}
                </label>
                <div className="border-2 border-gray-300 dark:border-gray-600 rounded-xl p-2 max-h-32 overflow-y-auto bg-white dark:bg-gray-800">
                  {users
                    .filter(
                      (u) =>
                        u.id !== formData.assignedToId &&
                        !u.name.toLowerCase().includes("admin"),
                    )
                    .map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.participantIds?.includes(user.id)}
                          onChange={(e) => {
                            const current = formData.participantIds || [];
                            if (e.target.checked)
                              setFormData({
                                ...formData,
                                participantIds: [...current, user.id],
                              });
                            else
                              setFormData({
                                ...formData,
                                participantIds: current.filter(
                                  (id) => id !== user.id,
                                ),
                              });
                          }}
                          className="rounded text-orange-600 focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {user.name}
                        </span>
                      </label>
                    ))}
                  {users.filter(
                    (u) =>
                      u.id !== formData.assignedToId &&
                      !u.name.toLowerCase().includes("admin"),
                  ).length === 0 && (
                    <p className="text-xs text-gray-500 italic p-1">
                      {t("crm.activities.no_more_agents")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Client Relationships */}
          {isClientMode && (
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-reply-border-dark animate-fadeIn">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                  <User className="w-4 h-4" />
                  {t("crm.activities.contact")}
                </label>
                <select
                  value={formData.contactId || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, contactId: e.target.value })
                  }
                  disabled={!!preselectedContact}
                  className={`w-full px-4 py-2.5 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all ${!!preselectedContact ? "opacity-70 cursor-not-allowed bg-gray-100 dark:bg-gray-900" : ""}`}
                >
                  <option value="">{t("crm.activities.select_contact_none")}</option>
                  {contacts.map(
                    (contact: { id: string; name: string; email?: string }) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}{" "}
                        {contact.email ? `(${contact.email})` : ""}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    {t("crm.activities.company")}
                  </label>
                  <select
                    value={formData.accountId}
                    onChange={(e) =>
                      setFormData({ ...formData, accountId: e.target.value })
                    }
                    className="w-full px-4 py-2.5 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  >
                    <option value="">{t("crm.activities.select_company_none")}</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    {t("crm.activities.deal")}
                  </label>
                  <select
                    value={formData.dealId}
                    onChange={(e) =>
                      setFormData({ ...formData, dealId: e.target.value })
                    }
                    className="w-full px-4 py-2.5 h-11 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  >
                    <option value="">{t("crm.activities.select_deal_none")}</option>
                    {deals.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Optional: Mark as Completed Checkbox */}
          {!activity && (
            <div className="pt-4 border-t border-gray-200 dark:border-reply-border-dark">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={markAsCompleted}
                  onChange={(e) => setMarkAsCompleted(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-gray-600"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {t("crm.activities.mark_completed")}
                </span>
              </label>
            </div>
          )}
        </form>
    </Modal>
  );
};
