import * as React from "react";
import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
	Button,
	Row,
	Column,
	Hr,
} from "@react-email/components";

interface EmailProps {
	url: string;
}

export function Email({ url }: EmailProps) {
	const expiryTime = "10 minutes";

	return (
		<Html>
			<Head>
				<style>
					{`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          `}
				</style>
			</Head>
			<Preview>
				Verify your CasualCall account - Start connecting today!
			</Preview>
			<Body style={main}>
				<Container style={container}>
					{/* Header Section */}
					<Section style={header}>
						<table
							cellPadding="0"
							cellSpacing="0"
							border={0}
							style={{ margin: "0 auto 24px auto" }}
						>
							<tr>
								<td style={{ verticalAlign: "middle", paddingRight: "10px" }}>
									<Img
										src="https://cashualcall.com/logo.webp"
										alt="CasualCall Logo"
										width={36}
										height={36}
										style={logo}
									/>
								</td>
								<td style={{ verticalAlign: "middle" }}>
									<Text style={brandText}>
										<span style={brandAccent}>Cashual</span>
										<span style={brandWhite}>Call</span>
									</Text>
								</td>
							</tr>
						</table>
						<Heading style={h1}>Verify Your Email</Heading>
						<Text style={headerSubtext}>
							One click away from connecting with the world
						</Text>
					</Section>

					{/* Main Content */}
					<Section style={mainContent}>
						<Text style={welcomeText}>
							Welcome to <strong style={brandHighlight}>CasualCall</strong>!
							We're excited to have you join our community. Verify your email to
							start connecting with people from around the world through video
							and text chat.
						</Text>

						{/* CTA Button */}
						<Section style={buttonSection}>
							<Button href={url} style={ctaButton}>
								✓ Verify My Email
							</Button>
						</Section>

						<Text style={expiryText}>
							⏱ This link expires in{" "}
							<strong style={brandHighlight}>{expiryTime}</strong>
						</Text>

						<Hr style={divider} />

						{/* Alternative Link */}
						<Text style={altLinkLabel}>
							If the button doesn't work, copy and paste this link:
						</Text>
						<Container style={linkBox}>
							<Link href={url} style={altLink}>
								{url}
							</Link>
						</Container>
					</Section>

					{/* Features Section */}
					<Section style={featuresSection}>
						<Text style={featuresTitle}>What awaits you:</Text>

						<Row style={featureRow}>
							<Column style={featureColumn}>
								<table cellPadding="0" cellSpacing="0" border={0} width="100%">
									<tr>
										<td style={featureIconCell}>💬</td>
										<td style={featureTextCell}>
											Chat anonymously with people worldwide
										</td>
									</tr>
								</table>
							</Column>
							<Column style={featureColumn}>
								<table cellPadding="0" cellSpacing="0" border={0} width="100%">
									<tr>
										<td style={featureIconCell}>🎥</td>
										<td style={featureTextCell}>
											Connect via voice & video calls
										</td>
									</tr>
								</table>
							</Column>
						</Row>
						<Row style={featureRow}>
							<Column style={featureColumn}>
								<table cellPadding="0" cellSpacing="0" border={0} width="100%">
									<tr>
										<td style={featureIconCell}>💰</td>
										<td style={featureTextCell}>
											Earn cash rewards for conversations
										</td>
									</tr>
								</table>
							</Column>
							<Column style={featureColumn}>
								<table cellPadding="0" cellSpacing="0" border={0} width="100%">
									<tr>
										<td style={featureIconCell}>🔒</td>
										<td style={featureTextCell}>Safe & moderated community</td>
									</tr>
								</table>
							</Column>
						</Row>
					</Section>

					{/* Footer */}
					<Section style={footer}>
						<Text style={footerNote}>
							Didn't request this email? You can safely ignore it.
						</Text>
						<Hr style={footerDivider} />
						<Text style={copyright}>
							© 2025 CasualCall. All rights reserved.
						</Text>
						<table
							cellPadding="0"
							cellSpacing="0"
							border={0}
							style={{ margin: "0 auto" }}
						>
							<tr>
								<td style={{ padding: "0 12px" }}>
									<Link
										href="https://casualcall.com/privacy"
										style={footerLink}
									>
										Privacy
									</Link>
								</td>
								<td style={{ color: "#4a4a4a" }}>•</td>
								<td style={{ padding: "0 12px" }}>
									<Link href="https://casualcall.com/terms" style={footerLink}>
										Terms
									</Link>
								</td>
								<td style={{ color: "#4a4a4a" }}>•</td>
								<td style={{ padding: "0 12px" }}>
									<Link
										href="https://casualcall.com/support"
										style={footerLink}
									>
										Support
									</Link>
								</td>
							</tr>
						</table>
					</Section>
				</Container>
			</Body>
		</Html>
	);
}

export default Email;

// ============ STYLES ============

const main: React.CSSProperties = {
	backgroundColor: "#0a0a0a",
	fontFamily:
		'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
	padding: "40px 16px",
};

const container: React.CSSProperties = {
	maxWidth: "520px",
	margin: "0 auto",
	backgroundColor: "#141414",
	borderRadius: "16px",
	overflow: "hidden",
	border: "1px solid #262626",
};

const header: React.CSSProperties = {
	backgroundColor: "#1a1a1a",
	padding: "40px 32px 32px",
	textAlign: "center",
	borderBottom: "1px solid #262626",
};

const logo: React.CSSProperties = {
	borderRadius: "8px",
};

const brandText: React.CSSProperties = {
	fontSize: "22px",
	fontWeight: 700,
	margin: "0",
	letterSpacing: "-0.5px",
};

const brandAccent: React.CSSProperties = {
	color: "#b6ff00",
};

const brandWhite: React.CSSProperties = {
	color: "#ffffff",
};

const h1: React.CSSProperties = {
	fontSize: "28px",
	fontWeight: 700,
	color: "#ffffff",
	margin: "0 0 8px 0",
	lineHeight: "1.3",
	letterSpacing: "-0.5px",
};

const headerSubtext: React.CSSProperties = {
	fontSize: "15px",
	color: "#888888",
	margin: "0",
	lineHeight: "1.5",
};

const mainContent: React.CSSProperties = {
	padding: "32px",
	backgroundColor: "#141414",
};

const welcomeText: React.CSSProperties = {
	fontSize: "15px",
	color: "#cccccc",
	lineHeight: "1.7",
	margin: "0 0 28px 0",
	textAlign: "center",
};

const brandHighlight: React.CSSProperties = {
	color: "#b6ff00",
};

const buttonSection: React.CSSProperties = {
	textAlign: "center",
	margin: "0 0 24px 0",
};

const ctaButton: React.CSSProperties = {
	backgroundColor: "#b6ff00",
	color: "#000000",
	fontSize: "15px",
	fontWeight: 600,
	padding: "14px 32px",
	borderRadius: "10px",
	textDecoration: "none",
	display: "inline-block",
	letterSpacing: "0.3px",
};

const expiryText: React.CSSProperties = {
	fontSize: "13px",
	color: "#888888",
	textAlign: "center",
	margin: "0 0 24px 0",
};

const divider: React.CSSProperties = {
	borderColor: "#262626",
	borderWidth: "1px",
	margin: "24px 0",
};

const altLinkLabel: React.CSSProperties = {
	fontSize: "13px",
	color: "#666666",
	margin: "0 0 12px 0",
	textAlign: "center",
};

const linkBox: React.CSSProperties = {
	backgroundColor: "#1a1a1a",
	padding: "14px 16px",
	borderRadius: "8px",
	border: "1px solid #262626",
	textAlign: "center",
};

const altLink: React.CSSProperties = {
	color: "#b6ff00",
	fontSize: "12px",
	textDecoration: "none",
	wordBreak: "break-all",
};

const featuresSection: React.CSSProperties = {
	padding: "0 32px 32px",
	backgroundColor: "#141414",
};

const featuresTitle: React.CSSProperties = {
	fontSize: "14px",
	fontWeight: 600,
	color: "#ffffff",
	textAlign: "center",
	margin: "0 0 20px 0",
	textTransform: "uppercase",
	letterSpacing: "1px",
};

const featureRow: React.CSSProperties = {
	marginBottom: "12px",
};

const featureColumn: React.CSSProperties = {
	width: "50%",
	padding: "0 6px",
	verticalAlign: "top",
};

const featureIconCell: React.CSSProperties = {
	width: "32px",
	fontSize: "18px",
	verticalAlign: "top",
	paddingTop: "2px",
};

const featureTextCell: React.CSSProperties = {
	fontSize: "12px",
	color: "#999999",
	lineHeight: "1.5",
	verticalAlign: "top",
};

const footer: React.CSSProperties = {
	backgroundColor: "#1a1a1a",
	padding: "24px 32px",
	textAlign: "center",
	borderTop: "1px solid #262626",
};

const footerNote: React.CSSProperties = {
	fontSize: "12px",
	color: "#666666",
	margin: "0 0 16px 0",
};

const footerDivider: React.CSSProperties = {
	borderColor: "#262626",
	borderWidth: "1px",
	margin: "16px 0",
};

const copyright: React.CSSProperties = {
	fontSize: "11px",
	color: "#4a4a4a",
	margin: "0 0 16px 0",
};

const footerLink: React.CSSProperties = {
	fontSize: "11px",
	color: "#888888",
	textDecoration: "none",
};
