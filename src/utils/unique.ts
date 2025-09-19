"use server";

import {
  uniqueNamesGenerator,
  adjectives,
  animals,
} from "unique-names-generator";

const generateUniqueName = async () => {
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: "",
    style: "capital",
    length: 2,
  });
  const randomNumber = Math.floor(Math.random() * 1000);
  return `${name}${randomNumber}`;
};

export default generateUniqueName;
