//Part 1

// Task 1
function getRandomNum(max: number): number {
  return Math.floor(Math.random() * max);
}

let randomNumber: number = getRandomNum(10);
console.log(randomNumber);

let userChoiceString = prompt("Choose a number:");
let userChoice: number = Number(userChoiceString);

if (userChoice == randomNumber) {
  console.log("Good Work!");
} else {
  console.log("Not Matched");
}

//Task 2
function check(a: number, b: number): boolean {
  if (a === 50 || b === 50) {
    return true;
  } else if (a + b === 50) {
    return true;
  } else {
    return false;
  }
}

console.log(check(30, 20));
console.log(check(50, 10)); 
console.log(check(10, 5));  


//Task 3
//(A)
const names: string[] = ["Anna", "Johannes", "Paula", "Daisy"];
let index: number = names.indexOf("Paula");

console.log(index);


//(B)
const names: string[] = ["Anna", "Johannes", "Paula", "Daisy"];
names.includes("Paula");

console.log(names.includes("Paula"));

//(C)
const names: string[] = ["Anna", "Johannes", "Paula", "Daisy"];
const searchName: string = "PAULA";

console.log(names.some(name => name.toLowerCase() === searchName.toLowerCase()));

//Task 4
function newString(str: string): string | boolean {
    if (str.length >= 3) {
        let back: string = str.substring(str.length - 3);
        return back + str + back;
    } else {
        return false;
    }
}

console.log(newString("umbrella"));

//Task 5
const names: string[] = ["Anna", "Johannes", "Paula", "Daisy"]

const newArray: string[] = names.map(name => name + " " + (name.length * 2));

console.log(newArray);

//Task 6

//A
//define a type for a single animal
type Animal = {
  weight: number;
  origin: string;
};

//define a type for a collection of animals
type ZooAnimals = {
  [animalName: string]: Animal;
};

//create an object using the types
const zooAnimals: ZooAnimals = {
  giraffe: { weight: 910, origin: "Tanzania" },
  lion: { weight: 200, origin: "Tanzania" },
  elephant: { weight: 5000, origin: "India" },
  penguin: { weight: 30, origin: "Argentina" },
  koala: { weight: 10, origin: "Australia" },
};

console.log("penguin" in zooAnimals);
console.log("snake" in zooAnimals);

//B
//define a type for a single animal
type Animal = {
  weight: number;
  origin: string;
};

//define a type for a collection of animals
type ZooAnimals = {
  [animalName: string]: Animal;
};

//create an object using the types
const zooAnimals: ZooAnimals = {
  giraffe: { weight: 910, origin: "Tanzania" },
  lion: { weight: 200, origin: "Tanzania" },
  elephant: { weight: 5000, origin: "India" },
  penguin: { weight: 30, origin: "Argentina" },
  koala: { weight: 10, origin: "Australia" },
};

//check if there are animals from Australia
let fromAustralia: boolean = false;

for (let animal in zooAnimals) {
  if (zooAnimals[animal].origin === "Australia") {
    fromAustralia = true;
  }
}

console.log("Animals from Australia:", fromAustralia);

//check if there are animals from Sweden
let fromSweden: boolean = false;

for (let animal in zooAnimals) {
  if (zooAnimals[animal].origin === "Sweden") {
    fromSweden = true;
  }
}

console.log("Animals from Sweden:", fromSweden);

//animals with weight above 1000 kg
let above1000kg: string[] = [];

for (let animal in zooAnimals) {
  if (zooAnimals[animal].weight > 1000) {
    above1000kg.push(animal);
  }
}

console.log("Animals above 1000 kg:", above1000kg);

//animals with weight below 5 kg
let below5kg: string[] = [];

for (let animal in zooAnimals) {
  if (zooAnimals[animal].weight < 5) {
    below5kg.push(animal);
  }
}

console.log("Animals below 5 kg:", below5kg);

//C
//define a type for a single animal
type Animal = {
  weight: number;
  origin: string;
};

//define a type for a collection of animals
type ZooAnimals = {
  [animalName: string]: Animal;
};

//create an object using the types
const zooAnimals: ZooAnimals = {
  giraffe: { weight: 910, origin: "Tanzania" },
  lion: { weight: 200, origin: "Tanzania" },
  elephant: { weight: 5000, origin: "India" },
  penguin: { weight: 30, origin: "Argentina" },
  koala: { weight: 10, origin: "Australia" },
};

zooAnimals.zebra = { weight: 300, origin: "Africa" };

for (let animal in zooAnimals) {
  console.log(animal);
}

//D
type Animal = {
  weight: number;
  origin: string;
};

type ZooAnimals = {
  animals: {
    [animalName: string]: Animal;
  };
  about: (name: string) => string;
};

const zooAnimals: ZooAnimals = {
  animals: {
    giraffe: { weight: 910, origin: "Tanzania" },
    lion: { weight: 200, origin: "Tanzania" },
    elephant: { weight: 5000, origin: "India" },
    penguin: { weight: 30, origin: "Argentina" },
    koala: { weight: 10, origin: "Australia" },
  },

  about(name: string) {
    const animal = this.animals[name];

    if (animal) {
      return `${name} weighs ${animal.weight}kg and comes from ${animal.origin}`;
    } else {
      return "we don't have this animal";
    }
  },
};

console.log(zooAnimals.about("giraffe"));
console.log(zooAnimals.about("cat"));