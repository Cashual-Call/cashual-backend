type SessionType = "call" | "chat";

export function calculatePoints(
	heartbeatCount: number,
	sessionType: SessionType,
): number {
	const minutes = (heartbeatCount * 5) / 60;

	if (sessionType === "call") {
		if (minutes < 2) return 50;
		if (minutes <= 5) return 100;
		if (minutes <= 10) return 200;
		return 250;
	}

	if (sessionType === "chat") {
		if (minutes < 3) return 0;
		if (minutes <= 5) return 25;
		if (minutes <= 9) return 50;
		return 75;
	}

	throw new Error("Invalid session type. Use 'call' or 'chat'.");
}
