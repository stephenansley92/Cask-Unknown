import { redirect } from "next/navigation";

type RateDetailPageProps = {
  params: {
    id: string;
  };
  searchParams?: {
    returnTo?: string | string[];
    owner?: string | string[];
  };
};

function getSingleQueryValue(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] || "";
  return "";
}

export default function RateDetailPageRedirect({
  params,
  searchParams,
}: RateDetailPageProps) {
  const ratingId = params?.id || "";
  if (!ratingId) {
    redirect("/rate");
  }

  const query = new URLSearchParams();
  const returnTo = getSingleQueryValue(searchParams?.returnTo);
  const owner = getSingleQueryValue(searchParams?.owner);

  if (returnTo && returnTo.startsWith("/")) {
    query.set("returnTo", returnTo);
  }

  if (owner) {
    query.set("owner", owner);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/history/rate/${ratingId}${suffix}`);
}
