import React, { useState, useEffect, useCallback } from "react";

/**
 * [CHAT] MENTION INPUT HOOK
 * Detects @username patterns and provides autocomplete
 */

export interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface UseMentionInputProps {
  value: string;
  onChange: (value: string) => void;
  teamMembers: TeamMember[];
}

interface MentionSuggestion {
  user: TeamMember;
  matchScore: number;
}

export const useMentionInput = ({
  value,
  onChange,
  teamMembers,
}: UseMentionInputProps) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Detect @ mentions and find matching users
  const detectMention = useCallback(
    (text: string, cursor: number) => {
      // Find the word before cursor that starts with @
      const beforeCursor = text.substring(0, cursor);
      const lastAt = beforeCursor.lastIndexOf("@");

      if (lastAt === -1) {
        setShowSuggestions(false);
        return;
      }

      // Extract the query after @
      const afterAt = beforeCursor.substring(lastAt + 1);

      // Check if there's a space (which ends the mention)
      if (afterAt.includes(" ")) {
        setShowSuggestions(false);
        return;
      }

      const query = afterAt.toLowerCase();

      // Filter team members by name or email
      const matches = teamMembers
        .map((user) => {
          const name = user.name?.toLowerCase() || "";
          const email = user.email.toLowerCase();

          let matchScore = 0;

          // Exact name match (highest priority)
          if (name === query) matchScore = 100;
          // Name starts with query
          else if (name.startsWith(query)) matchScore = 80;
          // Name contains query
          else if (name.includes(query)) matchScore = 60;
          // Email starts with query
          else if (email.startsWith(query)) matchScore = 40;
          // Email contains query
          else if (email.includes(query)) matchScore = 20;

          return { user, matchScore };
        })
        .filter((item) => item.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 5); // Top 5 matches

      if (matches.length > 0) {
        setSuggestions(matches);
        setShowSuggestions(true);
        setSelectedIndex(0);
      } else {
        setShowSuggestions(false);
      }
    },
    [teamMembers]
  );

  // Handle keyboard navigation in suggestions
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSuggestions) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : prev
          );
          return true;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          return true;

        case "Enter":
        case "Tab":
          if (suggestions[selectedIndex]) {
            e.preventDefault();
            insertMention(suggestions[selectedIndex].user);
            return true;
          }
          break;

        case "Escape":
          e.preventDefault();
          setShowSuggestions(false);
          return true;
      }

      return false;
    },
    [showSuggestions, suggestions, selectedIndex]
  );

  // Insert selected user mention
  const insertMention = useCallback(
    (user: TeamMember) => {
      const beforeCursor = value.substring(0, cursorPosition);
      const afterCursor = value.substring(cursorPosition);

      // Find the last @ position
      const lastAt = beforeCursor.lastIndexOf("@");
      if (lastAt === -1) return;

      // Build the mention text (using first name or email prefix)
      const mentionName =
        user.name?.split(" ")[0].toLowerCase() ||
        user.email.split("@")[0].toLowerCase();

      // Replace from @ to cursor with @mention
      const newText =
        beforeCursor.substring(0, lastAt) + `@${mentionName} ` + afterCursor;

      onChange(newText);
      setShowSuggestions(false);

      // Update cursor position (after the inserted mention)
      setTimeout(() => {
        const newPosition = lastAt + mentionName.length + 2; // @ + name + space
        setCursorPosition(newPosition);
      }, 0);
    },
    [value, cursorPosition, onChange]
  );

  // Handle text change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const newCursor = e.target.selectionStart || 0;

      onChange(newValue);
      setCursorPosition(newCursor);
      detectMention(newValue, newCursor);
    },
    [onChange, detectMention]
  );

  return {
    handleChange,
    handleKeyDown,
    showSuggestions,
    suggestions,
    selectedIndex,
    insertMention,
    setShowSuggestions,
  };
};
