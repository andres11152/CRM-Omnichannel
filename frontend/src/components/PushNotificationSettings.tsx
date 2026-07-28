import React, { useEffect } from 'react';
import {
  Bell,
  BellOff,
  MessageCircle,
  Ticket,
  TrendingUp,
  AlertTriangle,
  Smartphone,
  ShieldAlert,
} from 'lucide-react';
import { usePushNotifications, registerServiceWorker } from '@/hooks/usePushNotifications';
import '../styles/PushNotificationSettings.css';

/**
 *  PUSH NOTIFICATION SETTINGS COMPONENT
 * UI for managing push notification preferences
 */

export const PushNotificationSettings: React.FC = () => {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  // Register service worker on mount
  useEffect(() => {
    registerServiceWorker();
  }, []);

  if (!isSupported) {
    return (
      <div className="push-notification-settings">
        <div className="alert alert-warning">
          <h4>Push Notifications Not Available</h4>
          <p>Your browser doesn't support push notifications.</p>
          <p>Please use a modern browser like Chrome, Firefox, or Edge.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="push-notification-settings">
      <div className="setting-card">
        <div className="setting-header">
          <h3 className="flex items-center gap-2"><Bell size={18} /> Push Notifications</h3>
          <div className={`status-badge ${isSubscribed ? 'active' : 'inactive'}`}>
            {isSubscribed ? 'Enabled' : 'Disabled'}
          </div>
        </div>

        <p className="setting-description">
          Get instant notifications for new messages, tickets, and important updates - even when Sentry CRM is not open.
        </p>

        <div className="permission-status">
          <strong>Permission Status:</strong>{' '}
          <span className={`permission-${permission}`}>
            {permission === 'granted' ? '[OK] Granted' : permission === 'denied' ? '[ERROR] Denied' : '[WARNING] Not requested'}
          </span>
        </div>

        {permission === 'denied' && (
          <div className="alert alert-warning">
            <p>
              <strong>Notifications Blocked</strong>
            </p>
            <p>You've blocked notifications. To enable them:</p>
            <ol>
              <li>Click the lock icon in your browser's address bar</li>
              <li>Find "Notifications" in the permissions list</li>
              <li>Change it to "Allow"</li>
              <li>Refresh this page</li>
            </ol>
          </div>
        )}

        <div className="setting-actions">
          {!isSubscribed ? (
            <button
              onClick={subscribe}
              disabled={isLoading || permission === 'denied'}
              className="btn btn-primary"
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Enabling...
                </>
              ) : (
                <>
                  <Bell size={16} />
                  Enable Push Notifications
                </>
              )}
            </button>
          ) : (
            <button
              onClick={unsubscribe}
              disabled={isLoading}
              className="btn btn-secondary"
            >
              {isLoading ? (
                <>
                  <span className="spinner"></span>
                  Disabling...
                </>
              ) : (
                <>
                  <BellOff size={16} />
                  Disable Push Notifications
                </>
              )}
            </button>
          )}
        </div>

        {isSubscribed && (
          <div className="notification-info">
            <h4>You'll receive notifications for:</h4>
            <ul className="list-none pl-0">
              <li className="flex items-center gap-2"><MessageCircle size={16} /> New messages from customers</li>
              <li className="flex items-center gap-2"><Ticket size={16} /> Tickets assigned to you</li>
              <li className="flex items-center gap-2"><TrendingUp size={16} /> Campaign completion updates</li>
              <li className="flex items-center gap-2"><AlertTriangle size={16} /> Quota warnings and billing alerts</li>
              <li className="flex items-center gap-2"><Smartphone size={16} /> WhatsApp connection status</li>
              <li className="flex items-center gap-2"><ShieldAlert size={16} /> Security alerts</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default PushNotificationSettings;

