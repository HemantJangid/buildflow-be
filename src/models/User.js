import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    // Default minimum work hours for this user (can be overridden per project)
    minWorkHours: {
      type: Number,
      default: 8,
      min: 0,
      max: 24,
    },
    metadata: {
      dailyRate: {
        type: Number,
        default: 0,
      },
      visaCost: {
        type: Number,
        default: 0,
      },
      visaExpiry: {
        type: Date,
      },
      transportCost: {
        type: Number,
        default: 0,
      },
      fixedExtras: {
        type: Number,
        default: 0,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Worker category for reporting (e.g. Carpenter, Electrician, Finance)
    category: {
      type: String,
      enum: ['Carpenter', 'Electrician', 'Finance', 'Admin', 'Other'],
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
