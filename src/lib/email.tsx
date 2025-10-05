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
  Font,
} from "@react-email/components";

interface EmailProps {
  url: string;
}

export function Email({ url }: EmailProps) {
  const expiryTime = "10 minutes";

  return (
    <Html>
      <Head />
      <Preview>
        Verify your CasualCall account - Start connecting today!
      </Preview>
      <Body style={main}>
        <Font
          fontFamily="Space Grotesk"
          fallbackFontFamily="Verdana"
          webFont={{
            url: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400&display=swap",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Container style={wrapper}>
          {/* Header Section */}
          <Section style={header}>
            <Container style={logoContainer}>
              <Img
                src="https://casualcall.com/logo.webp"
                alt="CasualCall Logo"
                width={40}
                height={40}
                style={logo}
              />
              <Text style={brandText}>
                <span style={brandAccent}>Cashual</span>Call v2
              </Text>
            </Container>
            <Heading style={h1}>Verify Your Account</Heading>
            <Text style={headerSubtext}>
              Click the button below to verify your email and get started
            </Text>
          </Section>

          {/* Main Content Section */}
          <Section style={mainContent}>
            <Container style={contentWrapper}>
              {/* Welcome Message */}
              <Section style={welcomeCard}>
                <Text style={welcomeText}>
                  Welcome to <span style={brandHighlight}>CasualCall</span>! To
                  complete your registration and start connecting with strangers
                  through video and text chat, please verify your email address.
                </Text>

                {/* CTA Button */}
                <Section style={buttonContainer}>
                  <Button href={url} style={button}>
                    Verify Email Address
                  </Button>
                </Section>

                <Text style={expiryText}>
                  This link will expire in{" "}
                  <span style={brandHighlight}>{expiryTime}</span>
                </Text>
              </Section>

              {/* Alternative Link Section */}
              <Section style={alternativeCard}>
                <Text style={alternativeLabel}>
                  Button not working? Copy and paste this link:
                </Text>
                <Container style={linkContainer}>
                  <Link href={url} style={alternativeLink}>
                    {url}
                  </Link>
                </Container>
              </Section>

              {/* Features Section */}
              <Section style={featuresCard}>
                <Heading as="h2" style={h2}>
                  What's waiting for you:
                </Heading>
                <Container style={featuresGrid}>
                  {[
                    {
                      icon: "💬",
                      text: "Chat anonymously with people worldwide",
                    },
                    { icon: "🎥", text: "Connect via voice and video calls" },
                    { icon: "💰", text: "Earn cash rewards for conversations" },
                    { icon: "🔒", text: "Safe and moderated community" },
                  ].map((feature, index) => (
                    <Section key={index} style={featureItem}>
                      <Text style={featureIcon}>{feature.icon}</Text>
                      <Text style={featureText}>{feature.text}</Text>
                    </Section>
                  ))}
                </Container>
              </Section>
            </Container>
          </Section>

          {/* Footer Section */}
          <Section style={footer}>
            <Text style={footerText}>
              If you didn't request this email, you can safely ignore it.
            </Text>
            <Text style={copyright}>
              © 2025 CasualCall. All rights reserved.
            </Text>
            <Container style={footerLinks}>
              <Link href="https://casualcall.com/privacy" style={footerLink}>
                Privacy Policy
              </Link>
              <Text style={footerSeparator}>•</Text>
              <Link href="https://casualcall.com/terms" style={footerLink}>
                Terms of Service
              </Link>
              <Text style={footerSeparator}>•</Text>
              <Link href="https://casualcall.com/support" style={footerLink}>
                Support
              </Link>
            </Container>
          </Section>

          {/* Email Client Safety Text */}
          <Section style={disclaimer}>
            <Text style={disclaimerText}>
              This email was sent to verify your CasualCall account.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default Email;

// Styles
const main = {
  backgroundColor: "#f5f5f5",
  padding: "40px 0",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const wrapper = {
  width: "100%",
  maxWidth: "100%",
  margin: "0 auto",
  backgroundColor: "#211f22",
};

const header = {
  background: "linear-gradient(135deg, #211f22 0%, #2d2b2e 100%)",
  padding: "50px 20px",
  textAlign: "center" as const,
  borderBottom: "2px solid rgba(182, 255, 0, 0.2)",
};

const logoContainer = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "30px",
};

const logo = {
  display: "block",
  width: "40px",
  height: "40px",
};

const brandText = {
  fontSize: "28px",
  fontWeight: "bold",
  color: "#ffffff",
  margin: "0",
  display: "inline",
};

const brandAccent = {
  color: "#b6ff00",
};

const h1 = {
  fontSize: "36px",
  fontWeight: "bold",
  color: "#ffffff",
  margin: "0 0 15px 0",
  lineHeight: "1.2",
};

const headerSubtext = {
  fontSize: "18px",
  color: "#b3b3b3",
  margin: "0",
  maxWidth: "600px",
  marginLeft: "auto",
  marginRight: "auto",
};

const mainContent = {
  padding: "60px 20px",
  backgroundColor: "#211f22",
};

const contentWrapper = {
  maxWidth: "700px",
  margin: "0 auto",
};

const welcomeCard = {
  backgroundColor: "#2d2b2e",
  borderRadius: "12px",
  padding: "40px",
  marginBottom: "30px",
  border: "1px solid rgba(182, 255, 0, 0.15)",
};

const welcomeText = {
  fontSize: "18px",
  color: "#f5f5f5",
  lineHeight: "1.8",
  margin: "0 0 30px 0",
  textAlign: "center" as const,
};

const brandHighlight = {
  color: "#b6ff00",
  fontWeight: "600",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "40px 0",
};

const button = {
  display: "inline-block",
  backgroundColor: "#b6ff00",
  color: "#211f22",
  fontSize: "18px",
  fontWeight: "700",
  padding: "18px 50px",
  borderRadius: "12px",
  textDecoration: "none",
  boxShadow: "0 6px 20px rgba(182, 255, 0, 0.4)",
  letterSpacing: "0.5px",
};

const expiryText = {
  fontSize: "15px",
  color: "#b3b3b3",
  lineHeight: "1.6",
  margin: "30px 0 0 0",
  textAlign: "center" as const,
};

const alternativeCard = {
  backgroundColor: "#2d2b2e",
  borderRadius: "12px",
  padding: "25px 30px",
  border: "1px solid rgba(181, 156, 251, 0.15)",
  marginBottom: "30px",
};

const alternativeLabel = {
  fontSize: "14px",
  color: "#b3b3b3",
  margin: "0 0 12px 0",
  fontWeight: "600",
};

const linkContainer = {
  backgroundColor: "#211f22",
  padding: "15px",
  borderRadius: "8px",
  border: "1px solid rgba(182, 255, 0, 0.2)",
  wordBreak: "break-all" as const,
};

const alternativeLink = {
  color: "#b6ff00",
  fontSize: "13px",
  textDecoration: "none",
};

const featuresCard = {
  padding: "35px",
  backgroundColor: "rgba(45, 43, 46, 0.5)",
  borderRadius: "12px",
  border: "1px solid rgba(182, 255, 0, 0.1)",
};

const h2 = {
  fontSize: "22px",
  color: "#ffffff",
  margin: "0 0 25px 0",
  fontWeight: "600",
  textAlign: "center" as const,
};

const featuresGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "20px",
  maxWidth: "600px",
  margin: "0 auto",
};

const featureItem = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  backgroundColor: "#2d2b2e",
  padding: "15px",
  borderRadius: "8px",
  border: "1px solid rgba(182, 255, 0, 0.1)",
};

const featureIcon = {
  fontSize: "24px",
  flexShrink: 0,
  margin: "0",
};

const featureText = {
  fontSize: "14px",
  color: "#f5f5f5",
  lineHeight: "1.4",
  margin: "0",
};

const footer = {
  backgroundColor: "#2d2b2e",
  padding: "40px 20px",
  textAlign: "center" as const,
  borderTop: "1px solid rgba(182, 255, 0, 0.1)",
};

const footerText = {
  fontSize: "14px",
  color: "#b3b3b3",
  margin: "0 0 20px 0",
  lineHeight: "1.6",
};

const copyright = {
  fontSize: "13px",
  color: "#666666",
  margin: "0 0 20px 0",
};

const footerLinks = {
  display: "flex",
  justifyContent: "center",
  gap: "10px",
  flexWrap: "wrap" as const,
  marginTop: "20px",
};

const footerLink = {
  fontSize: "13px",
  color: "#b59cfb",
  textDecoration: "none",
};

const footerSeparator = {
  fontSize: "13px",
  color: "#666666",
  margin: "0 5px",
};

const disclaimer = {
  maxWidth: "600px",
  margin: "30px auto 0",
  padding: "0 20px",
  textAlign: "center" as const,
};

const disclaimerText = {
  fontSize: "11px",
  color: "#666666",
  margin: "0",
};
