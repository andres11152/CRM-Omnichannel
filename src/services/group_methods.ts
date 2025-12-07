/**
 * GROUP MANAGEMENT METHODS
 * Add these methods to the WhatsAppService class in whatsapp.service.ts
 */

/**
 * Create a new WhatsApp group
 * @param sessionId - Active WhatsApp session ID
 * @param groupName - Name of the group
 * @param participants - Array of phone numbers (without @s.whatsapp.net)
 * @returns Group ID and metadata
 */
async createGroup(sessionId: string, groupName: string, participants: string[]) {
  const sock = this.sessions.get(sessionId);
  if (!sock) {
    throw new Error(`No active session found: ${sessionId}`);
  }

  try {
    // Format participants as JIDs
    const participantJids = participants.map(p => 
      p.includes('@') ? p : `${p}@s.whatsapp.net`
    );

    console.log(`[WhatsApp] Creating group "${groupName}" with ${participantJids.length} participants`);
    
    const group = await sock.groupCreate(groupName, participantJids);
    
    console.log(`[WhatsApp] ✓ Group created: ${group.id}`);
    return {
      groupId: group.id,
      gid: group.gid,
      participants: group.participants
    };
  } catch (error) {
    console.error(`[WhatsApp] Error creating group:`, error);
    throw error;
  }
}

/**
 * Get group metadata (participants, admins, description)
 * @param sessionId - Active WhatsApp session ID
 * @param groupId - Group JID (e.g., 123456789@g.us)
 */
async getGroupMetadata(sessionId: string, groupId: string) {
  const sock = this.sessions.get(sessionId);
  if (!sock) {
    throw new Error(`No active session found: ${sessionId}`);
  }

  try {
    const metadata = await sock.groupMetadata(groupId);
    
    return {
      id: metadata.id,
      subject: metadata.subject,
      owner: metadata.owner,
      creation: metadata.creation,
      desc: metadata.desc,
      participants: metadata.participants.map((p: any) => ({
        id: p.id,
        isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
        isSuperAdmin: p.admin === 'superadmin'
      })),
      size: metadata.size
    };
  } catch (error) {
    console.error(`[WhatsApp] Error fetching group metadata:`, error);
    throw error;
  }
}

/**
 * Send message to a WhatsApp group
 * @param groupId - Group JID (e.g., 123456789@g.us)
 * @param text - Message text
 * @param sessionId - Optional session ID (uses first available if not provided)
 */
async sendToGroup(groupId: string, text: string, sessionId?: string) {
  let sock;
  let usedSessionId;

  if (sessionId && this.sessions.has(sessionId)) {
    sock = this.sessions.get(sessionId);
    usedSessionId = sessionId;
  } else {
    // Use first available session
    for (const [id, s] of this.sessions.entries()) {
      sock = s;
      usedSessionId = id;
      break;
    }
  }

  if (!sock) {
    throw new Error('No active WhatsApp sessions available');
  }

  try {
    console.log(`[WhatsApp] Sending to group ${groupId} via session ${usedSessionId}`);
    
    await sock.sendMessage(groupId, { text });
    
    console.log(`[WhatsApp] ✓ Message sent to group ${groupId}`);
    return true;
  } catch (error) {
    console.error(`[WhatsApp] Error sending to group:`, error);
    throw error;
  }
}

/**
 * Add participants to a group
 */
async addGroupParticipants(sessionId: string, groupId: string, participants: string[]) {
  const sock = this.sessions.get(sessionId);
  if (!sock) throw new Error(`No active session found: ${sessionId}`);

  const participantJids = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);
  const result = await sock.groupParticipantsUpdate(groupId, participantJids, 'add');
  console.log(`[WhatsApp] ✓ Added ${participantJids.length} participants to group`);
  return result;
}

/**
 * Remove participants from a group
 */
async removeGroupParticipants(sessionId: string, groupId: string, participants: string[]) {
  const sock = this.sessions.get(sessionId);
  if (!sock) throw new Error(`No active session found: ${sessionId}`);

  const participantJids = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);
  const result = await sock.groupParticipantsUpdate(groupId, participantJids, 'remove');
  console.log(`[WhatsApp] ✓ Removed ${participantJids.length} participants from group`);
  return result;
}

/**
 * Promote participants to admin
 */
async promoteGroupAdmins(sessionId: string, groupId: string, participants: string[]) {
  const sock = this.sessions.get(sessionId);
  if (!sock) throw new Error(`No active session found: ${sessionId}`);

  const participantJids = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);
  const result = await sock.groupParticipantsUpdate(groupId, participantJids, 'promote');
  console.log(`[WhatsApp] ✓ Promoted ${participantJids.length} participants to admin`);
  return result;
}

/**
 * Demote admins to regular participants
 */
async demoteGroupAdmins(sessionId: string, groupId: string, participants: string[]) {
  const sock = this.sessions.get(sessionId);
  if (!sock) throw new Error(`No active session found: ${sessionId}`);

  const participantJids = participants.map(p => p.includes('@') ? p : `${p}@s.whatsapp.net`);
  const result = await sock.groupParticipantsUpdate(groupId, participantJids, 'demote');
  console.log(`[WhatsApp] ✓ Demoted ${participantJids.length} admins to participants`);
  return result;
}
