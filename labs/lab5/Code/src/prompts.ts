export const prompts = {
  greeting: "Hello! How can I help you today?",
  noInput: "I can't hear you!",
  createMeetingPrompt: "Sure, let's set up that meeting.",
  askPerson: "Who would you like to schedule the meeting with?",
  askDate: "What date?",
  askTime: "What time?",
  invalidDate:
    "The date you provided is invalid. What date would you like to schedule?",
  invalidTime:
    "The time you provided is invalid. What time would you like to schedule?",
  confirmMeeting: (person: string, date: string, time: string) =>
    `I have scheduled a meeting with ${person} on ${date} at ${time}. Should I book it?`,
  meetingBooked: "Great, the meeting is booked!",
  meetingCancelled: "Okay, I have cancelled the request.",
  whoIsPrompt: (targetPersonName: string | null) =>
    targetPersonName
      ? `Let's find out who is ${targetPersonName}.`
      : "I didn't catch who you're asking about.",
  whoIsResult: (details: any) => {
    const occupation = details.occupation
      ?.map((o: string) => o.replace("_", " "))
      .join(", ");
    const genderPossessive = details.gender === "male" ? "His" : "Her";
    const genderPronoun = details.gender === "male" ? "he" : "she";
    const aliveStatus = details.is_alive
      ? "is currently still alive"
      : "has passed away";

    return `${details.name} is a ${details.gender} ${occupation} who is ${details.age} years old. ${genderPossessive} birthday is ${details.birthday} and ${genderPronoun} ${aliveStatus}.`;
  },
  whoIsFailure: (targetPersonName: string | null) =>
    `Sorry, I couldn't find any information about ${targetPersonName}.`,
};
